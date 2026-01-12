/**
 * Skill Installer - Downloads and installs skills to appropriate locations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  AgentProfile, 
  AgentId, 
  RegistrySkill, 
  InstalledSkill, 
  DetectedStack,
  SyncResult,
  SkillChange,
  SkillSource,
  PendingSkillChange,
  SyncPreview,
  MotherConfig
} from './types.js';
import { RegistryClient } from './registry-client.js';
import { AGENT_PROFILES } from './agent-profiles.js';

export interface SkillMatch {
  skill: RegistrySkill;
  matchedBy: string;
  confidence: number;
  source: SkillSource;
}

// Store pending syncs for confirmation
const pendingSyncs = new Map<string, {
  preview: SyncPreview;
  matches: SkillMatch[];
  installPath: string;
  installedSkills: InstalledSkill[];
  timestamp: number;
}>();

export class SkillInstaller {
  private projectPath: string;
  private config: MotherConfig;
  private registryClient: RegistryClient;
  private agentProfile: AgentProfile;

  constructor(
    projectPath: string,
    config: MotherConfig,
    registryClient: RegistryClient,
    agentProfile: AgentProfile
  ) {
    this.projectPath = projectPath;
    this.config = config;
    this.registryClient = registryClient;
    this.agentProfile = agentProfile;
  }

  /**
   * Generate a preview of skill changes for user validation
   */
  async previewSync(
    detectedStack: DetectedStack,
    installedSkills: InstalledSkill[],
    options: { forceRefresh?: boolean; agent?: string } = {}
  ): Promise<SyncPreview> {
    // Get all available skills from registry
    const availableSkills = await this.registryClient.getAllSkills(options.forceRefresh);

    // Match skills to detected stack (auto-discovered)
    const matchedSkills = this.matchSkillsToStack(detectedStack, availableSkills);

    // Add manually required skills
    for (const skillName of this.config.skills.always_include) {
      const skill = availableSkills.find(s => s.name === skillName);
      if (skill && !matchedSkills.find(m => m.skill.name === skillName)) {
        matchedSkills.push({
          skill,
          matchedBy: 'manual (always_include)',
          confidence: 1.0,
          source: 'manual'
        });
      }
    }

    // Remove excluded skills
    const filteredSkills = matchedSkills.filter(
      m => !this.config.skills.always_exclude.includes(m.skill.name)
    );

    // Resolve dependencies
    const resolvedSkills = await this.resolveDependencies(filteredSkills, availableSkills);

    // Filter out excluded skills again (they may have been added as dependencies)
    const finalSkills = resolvedSkills.filter(
      m => !this.config.skills.always_exclude.includes(m.skill.name)
    );

    // Build pending changes list
    const pendingChanges: PendingSkillChange[] = [];
    const manualSkills: string[] = [];
    const discoveredSkills: string[] = [];

    // Process each skill to determine action
    for (const match of finalSkills) {
      const existing = installedSkills.find(s => s.name === match.skill.name);
      
      if (match.source === 'manual') {
        manualSkills.push(match.skill.name);
      } else {
        discoveredSkills.push(match.skill.name);
      }

      if (existing) {
        // Check if update needed
        if (existing.version !== match.skill.version) {
          pendingChanges.push({
            name: match.skill.name,
            version: match.skill.version,
            oldVersion: existing.version,
            source: match.source,
            matchedBy: match.matchedBy,
            action: 'update',
            reason: `Update from v${existing.version} to v${match.skill.version} (${match.source === 'manual' ? 'manually configured' : 'auto-discovered'})`
          });
        }
      } else {
        // New skill
        pendingChanges.push({
          name: match.skill.name,
          version: match.skill.version,
          source: match.source,
          matchedBy: match.matchedBy,
          action: 'add',
          reason: match.source === 'manual' 
            ? `Manually configured in always_include`
            : `Auto-discovered: ${match.matchedBy}`
        });
      }
    }

    // Check for skills to remove
    if (this.config.sync.auto_remove) {
      const requiredNames = new Set(finalSkills.map(m => m.skill.name));
      for (const installed of installedSkills) {
        if (!requiredNames.has(installed.name)) {
          pendingChanges.push({
            name: installed.name,
            version: installed.version,
            source: 'discovery', // Was previously discovered
            action: 'remove',
            reason: 'No longer matches detected stack and not in always_include'
          });
        }
      }
    }

    // Generate preview ID
    const previewId = `sync_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const preview: SyncPreview = {
      pending_changes: pendingChanges,
      manual_skills: manualSkills,
      discovered_skills: discoveredSkills,
      requires_confirmation: pendingChanges.length > 0 && this.config.sync.prompt_on_changes,
      preview_id: previewId
    };

    // Store for later confirmation
    const installPath = this.getInstallPath(this.agentProfile);
    pendingSyncs.set(previewId, {
      preview,
      matches: finalSkills,
      installPath,
      installedSkills,
      timestamp: Date.now()
    });

    // Clean up old pending syncs (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [id, data] of pendingSyncs) {
      if (data.timestamp < fiveMinutesAgo) {
        pendingSyncs.delete(id);
      }
    }

    return preview;
  }

  /**
   * Confirm and execute a pending sync
   */
  async confirmSync(
    previewId: string,
    approvedSkills?: string[],
    rejectedSkills?: string[]
  ): Promise<SyncResult> {
    const pending = pendingSyncs.get(previewId);
    if (!pending) {
      throw new Error(`Preview "${previewId}" not found or expired. Please run preview_sync again.`);
    }

    const result: SyncResult = {
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
      agent: [this.agentProfile.id],
      paths: [pending.installPath],
      detected_stack: { languages: [], frameworks: [], databases: [], infrastructure: [], tools: [] }
    };

    // Create install directory
    await fs.mkdir(pending.installPath, { recursive: true });

    // Process approved changes
    for (const change of pending.preview.pending_changes) {
      // Skip if explicitly rejected
      if (rejectedSkills?.includes(change.name)) {
        continue;
      }

      // If approvedSkills is provided, only process those
      if (approvedSkills && !approvedSkills.includes(change.name)) {
        continue;
      }

      if (change.action === 'add') {
        const match = pending.matches.find(m => m.skill.name === change.name);
        if (match) {
          await this.installSkill(match.skill, pending.installPath);
          result.added.push({
            name: change.name,
            version: change.version,
            source: change.source
          });
        }
      } else if (change.action === 'update') {
        const match = pending.matches.find(m => m.skill.name === change.name);
        if (match) {
          await this.installSkill(match.skill, pending.installPath);
          result.updated.push({
            name: change.name,
            version: change.version,
            oldVersion: change.oldVersion,
            source: change.source
          });
        }
      } else if (change.action === 'remove') {
        await this.uninstallSkill(change.name, pending.installPath);
        result.removed.push({
          name: change.name,
          version: change.version,
          source: change.source
        });
      }
    }

    // Mark unchanged skills
    for (const installed of pending.installedSkills) {
      const wasChanged = [...result.added, ...result.updated, ...result.removed]
        .some(c => c.name === installed.name);
      if (!wasChanged) {
        result.unchanged.push({
          name: installed.name,
          version: installed.version
        });
      }
    }

    // Clean up
    pendingSyncs.delete(previewId);

    return result;
  }

  /**
   * Sync skills based on detected stack
   */
  async syncSkills(
    detectedStack: DetectedStack,
    installedSkills: InstalledSkill[],
    options: { forceRefresh?: boolean; dryRun?: boolean; agent?: string } = {}
  ): Promise<SyncResult> {
    const result: SyncResult = {
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
      agent: [],
      paths: [],
      detected_stack: detectedStack
    };

    // Determine target agents
    const targetAgents = this.resolveTargetAgents(options.agent);
    result.agent = targetAgents;

    // Get all available skills from registry
    const availableSkills = await this.registryClient.getAllSkills(options.forceRefresh);

    // Match skills to detected stack
    const matchedSkills = this.matchSkillsToStack(detectedStack, availableSkills);

    // Add manually required skills
    for (const skillName of this.config.skills.always_include) {
      const skill = availableSkills.find(s => s.name === skillName);
      if (skill && !matchedSkills.find(m => m.skill.name === skillName)) {
        matchedSkills.push({
          skill,
          matchedBy: 'manual (always_include)',
          confidence: 1.0,
          source: 'manual'
        });
      }
    }

    // Remove excluded skills
    const filteredSkills = matchedSkills.filter(
      m => !this.config.skills.always_exclude.includes(m.skill.name)
    );

    // Resolve dependencies
    const withDependencies = await this.resolveDependencies(filteredSkills, availableSkills);

    // Filter out excluded skills again (they may have been added as dependencies)
    const resolvedSkills = withDependencies.filter(
      m => !this.config.skills.always_exclude.includes(m.skill.name)
    );

    // Install to each target agent's path
    for (const agentId of targetAgents) {
      const profile = AGENT_PROFILES[agentId];
      const installPath = this.getInstallPath(profile);
      result.paths.push(installPath);

      // Create install directory
      if (!options.dryRun) {
        await fs.mkdir(installPath, { recursive: true });
      }

      // Process each skill
      for (const match of resolvedSkills) {
        const existing = installedSkills.find(s => s.name === match.skill.name);

        if (existing) {
          // Check if update needed
          if (existing.version !== match.skill.version) {
            if (!options.dryRun) {
              await this.installSkill(match.skill, installPath);
            }
            result.updated.push({
              name: match.skill.name,
              version: match.skill.version,
              oldVersion: existing.version
            });
          } else {
            result.unchanged.push({
              name: match.skill.name,
              version: match.skill.version
            });
          }
        } else {
          // New skill
          if (!options.dryRun) {
            await this.installSkill(match.skill, installPath);
          }
          result.added.push({
            name: match.skill.name,
            version: match.skill.version
          });
        }
      }

      // Check for skills to remove
      if (this.config.sync.auto_remove) {
        const requiredNames = new Set(resolvedSkills.map(m => m.skill.name));
        for (const installed of installedSkills) {
          if (!requiredNames.has(installed.name)) {
            if (!options.dryRun) {
              await this.uninstallSkill(installed.name, installPath);
            }
            result.removed.push({
              name: installed.name,
              version: installed.version
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Install a single skill
   */
  async installSkill(skill: RegistrySkill, installPath: string): Promise<void> {
    const skillDir = path.join(installPath, skill.name);

    // Create skill directory
    await fs.mkdir(skillDir, { recursive: true });

    // Fetch and write SKILL.md
    const content = await this.registryClient.fetchSkillContent(skill);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content);

    // Fetch and write resources
    const resources = await this.registryClient.fetchSkillResources(skill);
    if (resources.size > 0) {
      const resourcesDir = path.join(skillDir, 'resources');
      await fs.mkdir(resourcesDir, { recursive: true });

      for (const [name, resourceContent] of resources) {
        await fs.writeFile(path.join(resourcesDir, name), resourceContent);
      }
    }

    console.log(`Installed skill: ${skill.name} (v${skill.version})`);
  }

  /**
   * Uninstall a skill
   */
  async uninstallSkill(skillName: string, installPath: string): Promise<void> {
    const skillDir = path.join(installPath, skillName);

    try {
      await fs.rm(skillDir, { recursive: true });
      console.log(`Uninstalled skill: ${skillName}`);
    } catch (error) {
      console.error(`Failed to uninstall skill ${skillName}:`, error);
    }
  }

  /**
   * Install a skill by name
   */
  async installSkillByName(skillName: string): Promise<SkillChange | null> {
    const skill = await this.registryClient.getSkill(skillName);
    if (!skill) {
      return null;
    }

    const installPath = this.getInstallPath(this.agentProfile);
    await this.installSkill(skill, installPath);

    return {
      name: skill.name,
      version: skill.version
    };
  }

  /**
   * Get list of currently installed skills
   */
  async getInstalledSkills(): Promise<InstalledSkill[]> {
    const installed: InstalledSkill[] = [];
    const installPath = this.getInstallPath(this.agentProfile);

    try {
      const entries = await fs.readdir(installPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = path.join(installPath, entry.name, 'SKILL.md');
          
          try {
            const content = await fs.readFile(skillMdPath, 'utf-8');
            const metadata = this.parseSkillMetadata(content);
            const stat = await fs.stat(skillMdPath);

            installed.push({
              name: metadata.name || entry.name,
              version: metadata.version || '1.0.0',
              source: 'unknown',
              installed_at: stat.mtime.toISOString(),
              path: path.join(installPath, entry.name),
              last_updated: metadata.last_updated
            });
          } catch {
            // Skill directory without SKILL.md
          }
        }
      }
    } catch {
      // Install path doesn't exist yet
    }

    return installed;
  }

  /**
   * Match skills to detected stack
   */
  private matchSkillsToStack(
    stack: DetectedStack,
    availableSkills: RegistrySkill[]
  ): SkillMatch[] {
    const matches: SkillMatch[] = [];
    const allDetected = [
      ...stack.languages,
      ...stack.frameworks,
      ...stack.databases,
      ...stack.infrastructure,
      ...stack.tools
    ];

    for (const skill of availableSkills) {
      // Skip manual-only skills
      if (skill.triggers.manual_only) continue;

      // Check direct ID match
      const directMatch = allDetected.find(d => d.id === skill.name);
      if (directMatch) {
        matches.push({
          skill,
          matchedBy: `detected: ${directMatch.source}`,
          confidence: directMatch.confidence,
          source: 'discovery'
        });
        continue;
      }

      // Check trigger packages
      if (skill.triggers.packages) {
        for (const detected of allDetected) {
          if (skill.triggers.packages.some(pkg => 
            detected.source.toLowerCase().includes(pkg.toLowerCase())
          )) {
            matches.push({
              skill,
              matchedBy: `package trigger: ${detected.source}`,
              confidence: detected.confidence * 0.9,
              source: 'discovery'
            });
            break;
          }
        }
      }
    }

    return matches;
  }

  /**
   * Resolve skill dependencies
   */
  private async resolveDependencies(
    matches: SkillMatch[],
    availableSkills: RegistrySkill[]
  ): Promise<SkillMatch[]> {
    const resolved = new Map<string, SkillMatch>();

    // Add initial matches
    for (const match of matches) {
      resolved.set(match.skill.name, match);
    }

    // Resolve dependencies
    const toProcess = [...matches];
    while (toProcess.length > 0) {
      const current = toProcess.pop()!;
      
      if (current.skill.dependencies) {
        for (const depName of current.skill.dependencies) {
          if (!resolved.has(depName)) {
            const depSkill = availableSkills.find(s => s.name === depName);
            if (depSkill) {
              const depMatch: SkillMatch = {
                skill: depSkill,
                matchedBy: `dependency of ${current.skill.name}`,
                confidence: current.confidence * 0.8,
                source: 'dependency'
              };
              resolved.set(depName, depMatch);
              toProcess.push(depMatch);
            }
          }
        }
      }
    }

    return Array.from(resolved.values());
  }

  /**
   * Resolve target agents for installation
   */
  private resolveTargetAgents(override?: string): AgentId[] {
    if (override === 'both' || this.config.agent.sync_both) {
      return ['claude', 'copilot'];
    }

    if (override && override !== 'auto') {
      return [override as AgentId];
    }

    return [this.agentProfile.id];
  }

  /**
   * Get install path for agent
   */
  private getInstallPath(profile: AgentProfile): string {
    // Check config overrides
    const override = this.config.agent_overrides?.[profile.id]?.install_path;
    if (override) {
      return path.join(this.projectPath, override);
    }

    // Use default install path from config
    if (this.config.install_path) {
      return path.join(this.projectPath, this.config.install_path);
    }

    // Use profile default
    return path.join(this.projectPath, profile.projectSkillPaths[0]);
  }

  /**
   * Parse SKILL.md frontmatter
   */
  private parseSkillMetadata(content: string): Partial<RegistrySkill> {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return {};

    try {
      const yaml = require('yaml');
      return yaml.parse(frontmatterMatch[1]);
    } catch {
      return {};
    }
  }
}
