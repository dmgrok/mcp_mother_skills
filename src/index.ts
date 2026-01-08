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
  SyncResult
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
- Downloads missing skills to the appropriate location (.github/skills or .claude/skills)
- Reports changes (added/removed/updated skills)

Call this at the start of each conversation to ensure you have the right skills loaded.`,
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
          description: 'Show what would change without making changes',
          default: false
        },
        agent: {
          type: 'string',
          enum: ['auto', 'claude', 'copilot', 'both'],
          description: 'Override agent detection for this sync',
          default: 'auto'
        }
      }
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
    description: 'Set the preferred agent (Claude or Copilot) for skill installation.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['auto', 'claude', 'copilot', 'both'],
          description: 'Agent preference: auto (detect), claude, copilot, or both'
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
async function handleSyncSkills(params: SyncSkillsParams): Promise<SyncResult> {
  const config = await configManager.loadConfig();
  const { stack, sources } = await projectDetector.detect();
  const projectInfo = await projectDetector.getProjectInfo();
  const installedSkills = await skillInstaller.getInstalledSkills();

  const result = await skillInstaller.syncSkills(stack, installedSkills, {
    forceRefresh: params.force_refresh,
    dryRun: params.dry_run,
    agent: params.agent
  });

  // Update context
  if (!params.dry_run) {
    const newInstalled = await skillInstaller.getInstalledSkills();
    await configManager.updateContext(projectInfo, stack, sources, newInstalled);
  }

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
          const syncResult = await handleSyncSkills((args || {}) as SyncSkillsParams);
          result = {
            formatted: formatSyncResult(syncResult),
            data: syncResult
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
