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
  MotherConfig
} from './types.js';
import { RegistryClient } from './registry-client.js';
import { AGENT_PROFILES } from './agent-profiles.js';

export interface SkillMatch {
  skill: RegistrySkill;
  matchedBy: string;
  confidence: number;
}

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
          confidence: 1.0
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
          confidence: directMatch.confidence
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
              confidence: detected.confidence * 0.9
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
                confidence: current.confidence * 0.8
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
