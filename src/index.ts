#!/usr/bin/env node

/**
 * Mother MCP Server - Dynamic skill provisioning for Claude and Copilot
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import * as path from 'path';
import { 
  SyncSkillsParams, 
  SearchSkillsParams, 
  InstallSkillParams, 
  UninstallSkillParams,
  SetAgentPreferenceParams,
  ConfirmSyncParams,
  SyncResult,
  SyncPreview
} from './types.js';
import { AgentDetector } from './agent-detector.js';
import { ProjectDetector } from './project-detector.js';
import { RegistryClient } from './registry-client.js';
import { SkillInstaller } from './skill-installer.js';
import { ConfigManager } from './config-manager.js';

// Get project path from environment or current directory
const PROJECT_PATH = process.env.MOTHER_PROJECT_PATH || process.cwd();

// Initialize components
let configManager: ConfigManager;
let agentDetector: AgentDetector;
let projectDetector: ProjectDetector;
let registryClient: RegistryClient;
let skillInstaller: SkillInstaller;

async function initializeComponents(): Promise<void> {
  configManager = new ConfigManager(PROJECT_PATH);
  const config = await configManager.initializeConfig();

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
  }
];

// Tool handlers
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
      version: '1.0.0',
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

    try {
      let result: unknown;

      switch (name) {
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
