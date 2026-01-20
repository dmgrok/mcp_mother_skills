#!/usr/bin/env node

/**
 * Mother MCP Server - Dynamic skill provisioning for Claude and Copilot
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  SyncSkillsParams, 
  SearchSkillsParams, 
  InstallSkillParams, 
  UninstallSkillParams,
  SetAgentPreferenceParams,
  ConfirmSyncParams,
  SyncResult,
  SyncPreview,
  AgentId
} from './types.js';
import { AgentDetector } from './agent-detector.js';
import { ProjectDetector } from './project-detector.js';
import { RegistryClient } from './registry-client.js';
import { SkillInstaller } from './skill-installer.js';
import { ConfigManager } from './config-manager.js';
import { getAgentProfile } from './agent-profiles.js';

// Get project path from environment or current directory
const PROJECT_PATH = process.env.MOTHER_PROJECT_PATH || process.cwd();

// Initialize components
let configManager: ConfigManager;
let agentDetector: AgentDetector;
let projectDetector: ProjectDetector;
let registryClient: RegistryClient;
let skillInstaller: SkillInstaller;

async function initializeComponents(forceReload: boolean = false): Promise<void> {
  // Always reload config to pick up changes; components are lightweight to reinitialize
  if (forceReload || !configManager) {
    configManager = new ConfigManager(PROJECT_PATH);
  }
  
  const config = await configManager.loadConfig();

  agentDetector = new AgentDetector(PROJECT_PATH, config);
  projectDetector = new ProjectDetector(PROJECT_PATH);
  
  registryClient = new RegistryClient(
    config.registry,
    configManager.getCachePath(),
    config.cache.refresh_interval_days
  );

  const detection = await agentDetector.detect();
  
  skillInstaller = new SkillInstaller(
    PROJECT_PATH,
    config,
    registryClient,
    detection.agent
  );
}

// Define tools
const TOOLS: Tool[] = [
  {
    name: 'setup',
    description: `**Start here!** Initialize Mother MCP for your project.
This is the recommended first step when setting up Mother MCP. It will:
1. Scan your project to detect technologies (languages, frameworks, databases, tools)
2. Fetch the skill registry and find matching skills for your stack
3. Show recommended skills with match explanations
4. Let you choose which skills to install

Use this tool when users say things like "setup mother mcp", "initialize", "get started", or "what skills do I need".`,
    inputSchema: {
      type: 'object',
      properties: {
        auto_install: {
          type: 'boolean',
          description: 'Automatically install all recommended skills without confirmation',
          default: false
        }
      }
    }
  },
  {
    name: 'sync_skills',
    description: `Synchronize project skills based on detected technologies. 
This tool:
- Scans project files to detect your tech stack (package.json, requirements.txt, config files, etc.)
- Compares with the skill registry to find matching skills
- Shows a PREVIEW of changes and asks for user confirmation before applying
- Distinguishes between manually configured skills (always_include) and auto-discovered skills
- Downloads approved skills to the appropriate location (.github/skills, .claude/skills, or .codex/skills)

IMPORTANT: This tool will show proposed changes and wait for user approval before making changes.
Use dry_run=true to see changes without any prompt for confirmation.`,
    inputSchema: {
      type: 'object',
      properties: {
        force_refresh: {
          type: 'boolean',
          description: 'Force re-fetch from registry even if cache is fresh',
          default: false
        },
        dry_run: {
          type: 'boolean',
          description: 'Show what would change without making changes or prompting',
          default: false
        },
        agent: {
          type: 'string',
          enum: ['auto', 'claude', 'copilot', 'codex', 'both'],
          description: 'Override agent detection for this sync',
          default: 'auto'
        },
        skip_confirmation: {
          type: 'boolean',
          description: 'Skip user confirmation and apply all changes immediately (use with caution)',
          default: false
        }
      }
    }
  },
  {
    name: 'preview_sync',
    description: `Preview skill changes without applying them.
Shows what skills would be added, updated, or removed, distinguishing between:
- **Manual skills**: Configured in always_include (user explicitly requested)
- **Discovered skills**: Auto-detected from project tech stack
- **Dependencies**: Required by other skills

Returns a preview_id that can be used with confirm_sync to apply selected changes.`,
    inputSchema: {
      type: 'object',
      properties: {
        force_refresh: {
          type: 'boolean',
          description: 'Force re-fetch from registry even if cache is fresh',
          default: false
        },
        agent: {
          type: 'string',
          enum: ['auto', 'claude', 'copilot', 'codex', 'both'],
          description: 'Override agent detection for this preview',
          default: 'auto'
        }
      }
    }
  },
  {
    name: 'confirm_sync',
    description: `Confirm and apply skill changes from a preview.
Use after preview_sync to apply approved changes. You can:
- Apply all changes by just providing the preview_id
- Selectively approve specific skills with approved_skills
- Reject specific skills with rejected_skills`,
    inputSchema: {
      type: 'object',
      properties: {
        preview_id: {
          type: 'string',
          description: 'The preview_id from a previous preview_sync call'
        },
        approved_skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of skill names to approve (if omitted, all non-rejected are approved)'
        },
        rejected_skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of skill names to reject'
        }
      },
      required: ['preview_id']
    }
  },
  {
    name: 'get_project_context',
    description: 'View the detected project context including tech stack, installed skills, and agent information.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_agent_info',
    description: 'Get information about the detected agent (Claude or Copilot) and skill paths.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'search_skills',
    description: 'Search the registry for available skills by name, description, or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term to match against skill names and descriptions'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (e.g., "framework", "database", "infrastructure")'
        }
      }
    }
  },
  {
    name: 'install_skill',
    description: 'Manually install a skill from the registry by name.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'Name of the skill to install'
        }
      },
      required: ['skill_name']
    }
  },
  {
    name: 'uninstall_skill',
    description: 'Remove a skill from the project.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'Name of the skill to uninstall'
        }
      },
      required: ['skill_name']
    }
  },
  {
    name: 'check_updates',
    description: 'Check if any installed skills have newer versions available.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'set_agent_preference',
    description: 'Set the preferred agent (Claude, Copilot, or Codex) for skill installation.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['auto', 'claude', 'copilot', 'codex', 'both'],
          description: 'Agent preference: auto (detect), claude, copilot, codex, or both'
        }
      },
      required: ['agent']
    }
  },
  {
    name: 'redetect',
    description: 'Re-scan project files to update detected technologies.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'reset_skills',
    description: `Reset Mother MCP by removing all installed skills and optionally clearing configuration.
This is useful for starting fresh or troubleshooting issues. 

Warning: This will permanently delete all installed skills. Use with caution.`,
    inputSchema: {
      type: 'object',
      properties: {
        clear_config: {
          type: 'boolean',
          description: 'Also remove Mother configuration files (.mcp/mother/)',
          default: false
        },
        clear_cache: {
          type: 'boolean',
          description: 'Clear the skill registry cache',
          default: false
        },
        all_agents: {
          type: 'boolean',
          description: 'Remove skills for all agents (Claude, Copilot, Codex), not just the detected one',
          default: false
        },
        confirm: {
          type: 'boolean',
          description: 'Confirm you want to proceed with the reset',
          default: false
        }
      }
    }
  }
];

// Tool handlers

interface SetupParams {
  auto_install?: boolean;
}

interface SkillRecommendation {
  skill: {
    name: string;
    description: string;
    tags: string[];
  };
  match_reason: string;
  matched_technologies: string[];
  confidence: 'high' | 'medium' | 'low';
}

async function handleSetup(params: SetupParams): Promise<object> {
  // Force refresh to ensure we have latest registry
  await initializeComponents(true);
  
  // Step 1: Detect project tech stack
  const { stack, sources } = await projectDetector.detect();
  const projectInfo = await projectDetector.getProjectInfo();
  const installedSkills = await skillInstaller.getInstalledSkills();
  const detection = await agentDetector.detect();
  
  // Step 2: Fetch all available skills from registry
  const allSkills = await registryClient.getAllSkills(true);
  
  // Step 3: Find matching skills based on detected stack
  const recommendations: SkillRecommendation[] = [];
  const installedNames = new Set(installedSkills.map(s => s.name));
  
  // Collect all detected tech IDs
  const detectedTech = new Set<string>();
  stack.languages.forEach(l => detectedTech.add(l.id.toLowerCase()));
  stack.frameworks.forEach(f => detectedTech.add(f.id.toLowerCase()));
  stack.databases.forEach(d => detectedTech.add(d.id.toLowerCase()));
  stack.infrastructure.forEach(i => detectedTech.add(i.id.toLowerCase()));
  stack.tools.forEach(t => detectedTech.add(t.id.toLowerCase()));
  
  for (const skill of allSkills) {
    if (installedNames.has(skill.name)) continue;
    
    const matchedTech: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'low';
    
    // Check triggers
    const triggers = skill.triggers || {};
    
    // Check package triggers
    if (triggers.packages) {
      for (const pkg of triggers.packages) {
        if (detectedTech.has(pkg.toLowerCase())) {
          matchedTech.push(pkg);
          confidence = 'high';
        }
      }
    }
    
    // Check file triggers
    if (triggers.files) {
      for (const file of triggers.files) {
        const pattern = file.replace('*', '').toLowerCase();
        if ([...detectedTech].some(t => t.includes(pattern) || pattern.includes(t))) {
          matchedTech.push(file);
          if (confidence !== 'high') confidence = 'medium';
        }
      }
    }
    
    // Check tags match
    const skillTags = (skill.tags || []).map(t => t.toLowerCase());
    for (const tech of detectedTech) {
      if (skillTags.includes(tech)) {
        matchedTech.push(tech);
        if (confidence !== 'high') confidence = 'medium';
      }
    }
    
    // Check name/description for tech mentions
    const skillText = `${skill.name} ${skill.description}`.toLowerCase();
    for (const tech of detectedTech) {
      if (skillText.includes(tech) && !matchedTech.includes(tech)) {
        matchedTech.push(tech);
        if (confidence === 'low') confidence = 'low';
      }
    }
    
    if (matchedTech.length > 0) {
      recommendations.push({
        skill: {
          name: skill.name,
          description: skill.description,
          tags: skill.tags || []
        },
        match_reason: `Matches your ${matchedTech.join(', ')} stack`,
        matched_technologies: matchedTech,
        confidence
      });
    }
  }
  
  // Sort by confidence (high first) then by number of matches
  recommendations.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[a.confidence] - confOrder[b.confidence];
    }
    return b.matched_technologies.length - a.matched_technologies.length;
  });
  
  // If auto_install, install all high/medium confidence recommendations
  let installed: string[] = [];
  if (params.auto_install) {
    const toInstall = recommendations
      .filter(r => r.confidence !== 'low')
      .map(r => r.skill.name);
    
    for (const skillName of toInstall) {
      const result = await skillInstaller.installSkillByName(skillName);
      if (result) {
        installed.push(skillName);
        await configManager.addManualSkill(skillName);
      }
    }
  }
  
  // Update context
  const newInstalled = await skillInstaller.getInstalledSkills();
  await configManager.updateContext(projectInfo, stack, sources, newInstalled);
  
  return {
    project: projectInfo,
    detected_stack: {
      languages: stack.languages.map(l => ({ name: l.id, version: l.version })),
      frameworks: stack.frameworks.map(f => ({ name: f.id, version: f.version })),
      databases: stack.databases.map(d => ({ name: d.id })),
      infrastructure: stack.infrastructure.map(i => ({ name: i.id })),
      tools: stack.tools.map(t => ({ name: t.id, version: t.version }))
    },
    detection_sources: sources,
    agent: {
      detected: detection.agent.name,
      method: detection.method,
      skill_path: detection.agent.projectSkillPaths[0]
    },
    registry: {
      total_skills: allSkills.length,
      url: (await configManager.loadConfig()).registry[0]?.url
    },
    already_installed: installedSkills.map(s => s.name),
    recommendations: recommendations.slice(0, 10), // Top 10 recommendations
    auto_installed: installed.length > 0 ? installed : undefined,
    next_steps: installed.length > 0 
      ? ['Skills installed! You can use search_skills to find more.']
      : [
          'Review the recommendations above',
          'Use install_skill to add specific skills',
          'Or use sync_skills with skip_confirmation=true to install all matches'
        ]
  };
}

async function handleSyncSkills(params: SyncSkillsParams & { skip_confirmation?: boolean }): Promise<{ preview?: SyncPreview; result?: SyncResult; requires_confirmation: boolean }> {
  const config = await configManager.loadConfig();
  const { stack, sources } = await projectDetector.detect();
  const projectInfo = await projectDetector.getProjectInfo();
  const installedSkills = await skillInstaller.getInstalledSkills();

  // If dry_run, just return preview without any changes
  if (params.dry_run) {
    const preview = await skillInstaller.previewSync(stack, installedSkills, {
      forceRefresh: params.force_refresh,
      agent: params.agent
    });
    return { preview, requires_confirmation: false };
  }

  // If skip_confirmation or prompt_on_changes is false, do immediate sync
  if (params.skip_confirmation || !config.sync.prompt_on_changes) {
    const result = await skillInstaller.syncSkills(stack, installedSkills, {
      forceRefresh: params.force_refresh,
      dryRun: false,
      agent: params.agent
    });

    // Update context
    const newInstalled = await skillInstaller.getInstalledSkills();
    await configManager.updateContext(projectInfo, stack, sources, newInstalled);

    return { result, requires_confirmation: false };
  }

  // Otherwise, generate preview and require confirmation
  const preview = await skillInstaller.previewSync(stack, installedSkills, {
    forceRefresh: params.force_refresh,
    agent: params.agent
  });

  // If no changes, return early
  if (preview.pending_changes.length === 0) {
    return { 
      preview, 
      requires_confirmation: false 
    };
  }

  return { preview, requires_confirmation: true };
}

async function handlePreviewSync(params: SyncSkillsParams): Promise<SyncPreview> {
  const { stack } = await projectDetector.detect();
  const installedSkills = await skillInstaller.getInstalledSkills();

  const preview = await skillInstaller.previewSync(stack, installedSkills, {
    forceRefresh: params.force_refresh,
    agent: params.agent
  });

  return preview;
}

async function handleConfirmSync(params: ConfirmSyncParams): Promise<SyncResult> {
  const result = await skillInstaller.confirmSync(
    params.preview_id,
    params.approved_skills,
    params.rejected_skills
  );

  // Update context after confirmation
  const { stack, sources } = await projectDetector.detect();
  const projectInfo = await projectDetector.getProjectInfo();
  const newInstalled = await skillInstaller.getInstalledSkills();
  await configManager.updateContext(projectInfo, stack, sources, newInstalled);

  return result;
}

async function handleGetProjectContext(): Promise<object> {
  const context = await configManager.loadContext();
  
  if (!context) {
    // Generate fresh context
    const { stack, sources } = await projectDetector.detect();
    const projectInfo = await projectDetector.getProjectInfo();
    const installedSkills = await skillInstaller.getInstalledSkills();
    
    return await configManager.updateContext(projectInfo, stack, sources, installedSkills);
  }

  return context;
}

async function handleGetAgentInfo(): Promise<object> {
  const detection = await agentDetector.detect();
  const config = await configManager.loadConfig();

  return {
    detected_agent: detection.agent.id,
    agent_name: detection.agent.name,
    detection_method: detection.method,
    confidence: detection.confidence,
    skill_paths: {
      project: detection.agent.projectSkillPaths,
      personal: detection.agent.personalSkillPath
    },
    instructions_file: detection.agent.instructionsFile,
    config: {
      mode: config.agent.mode,
      sync_both: config.agent.sync_both,
      force: config.agent.force
    }
  };
}

async function handleSearchSkills(params: SearchSkillsParams): Promise<object[]> {
  const skills = await registryClient.searchSkills(params.query, params.tags);
  
  return skills.map(skill => ({
    name: skill.name,
    version: skill.version,
    description: skill.description,
    tags: skill.tags || [],
    triggers: skill.triggers,
    dependencies: skill.dependencies || []
  }));
}

async function handleInstallSkill(params: InstallSkillParams): Promise<object> {
  const result = await skillInstaller.installSkillByName(params.skill_name);
  
  if (!result) {
    return {
      success: false,
      error: `Skill "${params.skill_name}" not found in registry`
    };
  }

  // Add to manual includes
  await configManager.addManualSkill(params.skill_name);

  return {
    success: true,
    installed: result
  };
}

async function handleUninstallSkill(params: UninstallSkillParams): Promise<object> {
  const detection = await agentDetector.detect();
  const config = await configManager.loadConfig();
  const installPath = config.install_path 
    ? path.join(PROJECT_PATH, config.install_path)
    : path.join(PROJECT_PATH, detection.agent.projectSkillPaths[0]);

  await skillInstaller.uninstallSkill(params.skill_name, installPath);
  await configManager.excludeSkill(params.skill_name);

  return {
    success: true,
    uninstalled: params.skill_name
  };
}

async function handleCheckUpdates(): Promise<object[]> {
  const installed = await skillInstaller.getInstalledSkills();
  const updates: object[] = [];

  for (const skill of installed) {
    const latest = await registryClient.getSkill(skill.name);
    if (latest && latest.version !== skill.version) {
      updates.push({
        name: skill.name,
        current_version: skill.version,
        latest_version: latest.version,
        last_updated: latest.last_updated
      });
    }
  }

  return updates;
}

async function handleSetAgentPreference(params: SetAgentPreferenceParams): Promise<object> {
  await configManager.setAgentPreference(params.agent);
  
  return {
    success: true,
    preference: params.agent,
    message: params.agent === 'both' 
      ? 'Skills will be installed to both .claude/skills and .github/skills'
      : params.agent === 'auto'
        ? 'Agent will be auto-detected'
        : `Skills will be installed for ${params.agent}`
  };
}

async function handleRedetect(): Promise<object> {
  const { stack, sources } = await projectDetector.detect();
  const projectInfo = await projectDetector.getProjectInfo();
  const installedSkills = await skillInstaller.getInstalledSkills();

  const context = await configManager.updateContext(projectInfo, stack, sources, installedSkills);

  return {
    project: context.project,
    detected: context.detected,
    sources: context.detection_sources
  };
}

interface ResetSkillsParams {
  clear_config?: boolean;
  clear_cache?: boolean;
  all_agents?: boolean;
  confirm?: boolean;
}

async function handleResetSkills(params: ResetSkillsParams): Promise<object> {
  if (!params.confirm) {
    return {
      error: 'Reset cancelled',
      message: 'You must set confirm=true to proceed with resetting skills. This action cannot be undone.',
      warning: 'This will permanently delete all installed skills.'
    };
  }

  const config = await configManager.loadConfig();
  const detection = await agentDetector.detect();
  const results = {
    removed_skills: [] as string[],
    removed_paths: [] as string[],
    cleared_config: false,
    cleared_cache: false,
    errors: [] as string[]
  };

  // Determine which agents to reset
  const agentsToReset: AgentId[] = params.all_agents 
    ? ['claude', 'copilot', 'codex', 'generic']
    : [detection.agent.id];

  // Remove skills for each agent
  for (const agentId of agentsToReset) {
    const profile = getAgentProfile(agentId);
    
    for (const skillPath of profile.projectSkillPaths) {
      const fullPath = path.join(PROJECT_PATH, skillPath);
      
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          // List skills before removing
          const entries = await fs.readdir(fullPath, { withFileTypes: true });
          const skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
          
          // Remove the entire skills directory
          await fs.rm(fullPath, { recursive: true, force: true });
          
          results.removed_skills.push(...skillDirs);
          results.removed_paths.push(fullPath);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          results.errors.push(`Failed to remove ${fullPath}: ${(error as Error).message}`);
        }
        // ENOENT means directory doesn't exist, which is fine
      }
    }
  }

  // Clear configuration if requested
  if (params.clear_config) {
    const configPath = path.join(PROJECT_PATH, '.mcp', 'mother');
    try {
      await fs.rm(configPath, { recursive: true, force: true });
      results.cleared_config = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        results.errors.push(`Failed to clear config: ${(error as Error).message}`);
      }
    }
  }

  // Clear cache if requested
  if (params.clear_cache) {
    const cachePath = configManager.getCachePath();
    try {
      await fs.rm(cachePath, { recursive: true, force: true });
      results.cleared_cache = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        results.errors.push(`Failed to clear cache: ${(error as Error).message}`);
      }
    }
  }

  return {
    success: results.errors.length === 0,
    message: results.errors.length === 0 
      ? 'Successfully reset Mother MCP'
      : 'Reset completed with some errors',
    ...results,
    summary: {
      skills_removed: [...new Set(results.removed_skills)].length,
      paths_cleared: results.removed_paths.length,
      config_cleared: results.cleared_config,
      cache_cleared: results.cleared_cache
    },
    next_steps: [
      'Run setup to reinstall skills',
      'Or use sync_skills to auto-detect and install'
    ]
  };
}

// Format sync result for display
function formatSyncResult(result: SyncResult): string {
  let output = `## Skill Sync Complete\n\n`;
  output += `**Agent:** ${result.agent.join(', ')}\n`;
  output += `**Install paths:** ${result.paths.join(', ')}\n\n`;

  if (result.added.length > 0) {
    output += `### Added (${result.added.length})\n`;
    result.added.forEach(s => {
      output += `- ✅ ${s.name} (v${s.version})\n`;
    });
    output += '\n';
  }

  if (result.updated.length > 0) {
    output += `### Updated (${result.updated.length})\n`;
    result.updated.forEach(s => {
      output += `- ⬆️ ${s.name} (v${s.oldVersion} → v${s.version})\n`;
    });
    output += '\n';
  }

  if (result.removed.length > 0) {
    output += `### Removed (${result.removed.length})\n`;
    result.removed.forEach(s => {
      output += `- ❌ ${s.name}\n`;
    });
    output += '\n';
  }

  if (result.unchanged.length > 0) {
    output += `### Unchanged (${result.unchanged.length})\n`;
    output += result.unchanged.map(s => s.name).join(', ') + '\n\n';
  }

  // Detected stack summary
  output += `### Detected Stack\n`;
  const { detected_stack: stack } = result;
  
  if (stack.languages.length > 0) {
    output += `- **Languages:** ${stack.languages.map(l => l.id).join(', ')}\n`;
  }
  if (stack.frameworks.length > 0) {
    output += `- **Frameworks:** ${stack.frameworks.map(f => f.id).join(', ')}\n`;
  }
  if (stack.databases.length > 0) {
    output += `- **Databases:** ${stack.databases.map(d => d.id).join(', ')}\n`;
  }
  if (stack.infrastructure.length > 0) {
    output += `- **Infrastructure:** ${stack.infrastructure.map(i => i.id).join(', ')}\n`;
  }
  if (stack.tools.length > 0) {
    output += `- **Tools:** ${stack.tools.map(t => t.id).join(', ')}\n`;
  }

  return output;
}

// Format setup result for display
function formatSetupResult(result: any): string {
  let output = `## 🚀 Mother MCP Setup Complete\n\n`;
  
  // Project info
  output += `### Project: ${result.project?.name || 'Unknown'}\n`;
  if (result.project?.description) {
    output += `${result.project.description}\n`;
  }
  output += '\n';
  
  // Detected stack
  output += `### Detected Tech Stack\n`;
  const { detected_stack } = result;
  
  if (detected_stack?.languages?.length > 0) {
    output += `**Languages:** ${detected_stack.languages.map((l: any) => l.version ? `${l.name} (${l.version})` : l.name).join(', ')}\n`;
  }
  if (detected_stack?.frameworks?.length > 0) {
    output += `**Frameworks:** ${detected_stack.frameworks.map((f: any) => f.version ? `${f.name} (${f.version})` : f.name).join(', ')}\n`;
  }
  if (detected_stack?.databases?.length > 0) {
    output += `**Databases:** ${detected_stack.databases.map((d: any) => d.name).join(', ')}\n`;
  }
  if (detected_stack?.tools?.length > 0) {
    output += `**Tools:** ${detected_stack.tools.map((t: any) => t.name).join(', ')}\n`;
  }
  output += `\n_Sources: ${result.detection_sources?.join(', ') || 'N/A'}_\n\n`;
  
  // Agent detection
  output += `### Agent\n`;
  output += `**Detected:** ${result.agent?.detected || 'Unknown'} (via ${result.agent?.method || 'auto'})\n`;
  output += `**Skills path:** \`${result.agent?.skill_path || 'N/A'}\`\n\n`;
  
  // Registry info
  output += `### Registry\n`;
  output += `**Available skills:** ${result.registry?.total_skills || 0}\n\n`;
  
  // Already installed
  if (result.already_installed?.length > 0) {
    output += `### Already Installed\n`;
    output += result.already_installed.map((s: string) => `✅ ${s}`).join('\n') + '\n\n';
  }
  
  // Auto-installed
  if (result.auto_installed?.length > 0) {
    output += `### 🎉 Auto-Installed Skills\n`;
    output += result.auto_installed.map((s: string) => `✅ ${s}`).join('\n') + '\n\n';
  }
  
  // Recommendations
  if (result.recommendations?.length > 0) {
    output += `### 💡 Recommended Skills\n\n`;
    
    const highConf = result.recommendations.filter((r: any) => r.confidence === 'high');
    const medConf = result.recommendations.filter((r: any) => r.confidence === 'medium');
    const lowConf = result.recommendations.filter((r: any) => r.confidence === 'low');
    
    if (highConf.length > 0) {
      output += `**🎯 High Match:**\n`;
      for (const rec of highConf) {
        output += `- **${rec.skill.name}** - ${rec.skill.description.slice(0, 80)}...\n`;
        output += `  _${rec.match_reason}_\n`;
      }
      output += '\n';
    }
    
    if (medConf.length > 0) {
      output += `**👍 Good Match:**\n`;
      for (const rec of medConf) {
        output += `- **${rec.skill.name}** - ${rec.skill.description.slice(0, 80)}...\n`;
        output += `  _${rec.match_reason}_\n`;
      }
      output += '\n';
    }
    
    if (lowConf.length > 0) {
      output += `**🔎 Possible Match:**\n`;
      for (const rec of lowConf.slice(0, 3)) { // Limit low confidence
        output += `- **${rec.skill.name}** - ${rec.skill.description.slice(0, 80)}...\n`;
      }
      output += '\n';
    }
  } else {
    output += `### Recommendations\n`;
    output += `No specific skill matches found for your stack. Use \`search_skills\` to browse available skills.\n\n`;
  }
  
  // Next steps
  output += `### Next Steps\n`;
  for (const step of (result.next_steps || [])) {
    output += `- ${step}\n`;
  }
  
  return output;
}

// Format preview for display
function formatPreview(preview: SyncPreview): string {
  let output = `## Skill Sync Preview\n\n`;
  
  if (preview.pending_changes.length === 0) {
    output += `✅ **No changes needed** - all skills are up to date.\n\n`;
    return output;
  }

  output += `**Preview ID:** \`${preview.preview_id}\`\n\n`;
  output += `⚠️ **The following changes require your approval:**\n\n`;

  // Group by action
  const toAdd = preview.pending_changes.filter(c => c.action === 'add');
  const toUpdate = preview.pending_changes.filter(c => c.action === 'update');
  const toRemove = preview.pending_changes.filter(c => c.action === 'remove');

  if (toAdd.length > 0) {
    output += `### Skills to Add (${toAdd.length})\n`;
    for (const change of toAdd) {
      const sourceIcon = change.source === 'manual' ? '📌' : change.source === 'dependency' ? '🔗' : '🔍';
      const sourceLabel = change.source === 'manual' ? 'Manual' : change.source === 'dependency' ? 'Dependency' : 'Auto-discovered';
      output += `- ${sourceIcon} **${change.name}** (v${change.version}) - ${sourceLabel}\n`;
      output += `  _${change.reason}_\n`;
    }
    output += '\n';
  }

  if (toUpdate.length > 0) {
    output += `### Skills to Update (${toUpdate.length})\n`;
    for (const change of toUpdate) {
      const sourceIcon = change.source === 'manual' ? '📌' : '🔍';
      output += `- ${sourceIcon} **${change.name}** (v${change.oldVersion} → v${change.version})\n`;
      output += `  _${change.reason}_\n`;
    }
    output += '\n';
  }

  if (toRemove.length > 0) {
    output += `### Skills to Remove (${toRemove.length})\n`;
    for (const change of toRemove) {
      output += `- ❌ **${change.name}** (v${change.version})\n`;
      output += `  _${change.reason}_\n`;
    }
    output += '\n';
  }

  output += `---\n\n`;
  output += `**Legend:** 📌 Manual | 🔍 Auto-discovered | 🔗 Dependency\n\n`;
  output += `### How to proceed:\n`;
  output += `- To **approve all changes**, use \`confirm_sync\` with preview_id: \`${preview.preview_id}\`\n`;
  output += `- To **selectively approve**, provide \`approved_skills\` array\n`;
  output += `- To **reject specific skills**, provide \`rejected_skills\` array\n`;

  return output;
}

// Create and run server
async function main(): Promise<void> {
  await initializeComponents();

  const server = new Server(
    {
      name: 'mcp-mother-skills',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Reload config on each tool call to pick up any external changes
    await initializeComponents();

    try {
      let result: unknown;

      switch (name) {
        case 'setup':
          const setupResult = await handleSetup((args || {}) as SetupParams);
          result = {
            formatted: formatSetupResult(setupResult),
            ...setupResult
          };
          break;

        case 'sync_skills':
          const syncResponse = await handleSyncSkills((args || {}) as SyncSkillsParams & { skip_confirmation?: boolean });
          if (syncResponse.requires_confirmation && syncResponse.preview) {
            result = {
              formatted: formatPreview(syncResponse.preview),
              preview: syncResponse.preview,
              message: 'Please review the changes above and use confirm_sync to apply them.'
            };
          } else if (syncResponse.result) {
            result = {
              formatted: formatSyncResult(syncResponse.result),
              data: syncResponse.result
            };
          } else if (syncResponse.preview) {
            result = {
              formatted: formatPreview(syncResponse.preview),
              preview: syncResponse.preview
            };
          }
          break;

        case 'preview_sync':
          const preview = await handlePreviewSync((args || {}) as SyncSkillsParams);
          result = {
            formatted: formatPreview(preview),
            preview
          };
          break;

        case 'confirm_sync':
          const confirmResult = await handleConfirmSync(args as unknown as ConfirmSyncParams);
          result = {
            formatted: formatSyncResult(confirmResult),
            data: confirmResult
          };
          break;

        case 'get_project_context':
          result = await handleGetProjectContext();
          break;

        case 'get_agent_info':
          result = await handleGetAgentInfo();
          break;

        case 'search_skills':
          result = await handleSearchSkills((args || {}) as SearchSkillsParams);
          break;

        case 'install_skill':
          result = await handleInstallSkill(args as unknown as InstallSkillParams);
          break;

        case 'uninstall_skill':
          result = await handleUninstallSkill(args as unknown as UninstallSkillParams);
          break;

        case 'check_updates':
          result = await handleCheckUpdates();
          break;

        case 'set_agent_preference':
          result = await handleSetAgentPreference(args as unknown as SetAgentPreferenceParams);
          break;

        case 'redetect':
          result = await handleRedetect();
          break;

        case 'reset_skills':
          result = await handleResetSkills((args || {}) as ResetSkillsParams);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' 
              ? result 
              : JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('Mother MCP Server started');
  console.error(`Project path: ${PROJECT_PATH}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
