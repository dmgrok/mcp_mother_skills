/**
 * Config Manager - Handles mother config and project context YAML files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { 
  MotherConfig, 
  ProjectContext, 
  DetectedStack, 
  InstalledSkill 
} from './types.js';

const DEFAULT_CONFIG: MotherConfig = {
  version: '1.0',
  agent: {
    mode: 'auto',
    sync_both: false
  },
  registry: [
    {
      url: 'https://github.com/anthropics/skills',
      priority: 1
    }
  ],
  cache: {
    refresh_interval_days: 7,
    registry_cache: '.mcp/mother/cache'
  },
  detection: {
    enabled: true,
    sources: [
      {
        type: 'package_manager',
        patterns: ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod']
      },
      {
        type: 'config',
        patterns: ['tsconfig.json', 'next.config.*', 'Dockerfile', 'docker-compose*.yaml']
      },
      {
        type: 'readme',
        file: 'README.md'
      }
    ]
  },
  skills: {
    always_include: [],
    always_exclude: []
  },
  sync: {
    auto_remove: false,
    prompt_on_changes: true
  }
};

export class ConfigManager {
  private projectPath: string;
  private configPath: string;
  private contextPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.configPath = path.join(projectPath, '.mcp/mother/config.yaml');
    this.contextPath = path.join(projectPath, '.mcp/mother/project-context.yaml');
  }

  /**
   * Load or create config
   */
  async loadConfig(): Promise<MotherConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const loaded = yaml.parse(content) as Partial<MotherConfig>;
      return this.mergeWithDefaults(loaded);
    } catch {
      // Return default config if file doesn't exist
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save config
   */
  async saveConfig(config: MotherConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    const content = yaml.stringify(config, { indent: 2 });
    await fs.writeFile(this.configPath, content);
  }

  /**
   * Initialize config if it doesn't exist
   */
  async initializeConfig(): Promise<MotherConfig> {
    try {
      await fs.access(this.configPath);
      return await this.loadConfig();
    } catch {
      // Create default config
      const config = { ...DEFAULT_CONFIG };
      await this.saveConfig(config);
      return config;
    }
  }

  /**
   * Load project context
   */
  async loadContext(): Promise<ProjectContext | null> {
    try {
      const content = await fs.readFile(this.contextPath, 'utf-8');
      return yaml.parse(content) as ProjectContext;
    } catch {
      return null;
    }
  }

  /**
   * Save project context
   */
  async saveContext(context: ProjectContext): Promise<void> {
    await fs.mkdir(path.dirname(this.contextPath), { recursive: true });
    const content = yaml.stringify(context, { indent: 2 });
    await fs.writeFile(this.contextPath, content);
  }

  /**
   * Update project context with new detection results
   */
  async updateContext(
    projectInfo: { name: string; description?: string },
    detectedStack: DetectedStack,
    sources: string[],
    installedSkills: InstalledSkill[]
  ): Promise<ProjectContext> {
    // Load existing context to preserve manual settings
    const existing = await this.loadContext();

    const context: ProjectContext = {
      generated_at: new Date().toISOString(),
      detection_sources: sources,
      project: projectInfo,
      detected: detectedStack,
      installed_skills: installedSkills,
      manual: existing?.manual || {
        include_skills: [],
        exclude_skills: []
      }
    };

    await this.saveContext(context);
    return context;
  }

  /**
   * Add a skill to manual includes
   */
  async addManualSkill(skillName: string): Promise<void> {
    const context = await this.loadContext();
    if (!context) return;

    if (!context.manual.include_skills.includes(skillName)) {
      context.manual.include_skills.push(skillName);
    }
    
    // Remove from excludes if present
    context.manual.exclude_skills = context.manual.exclude_skills.filter(
      s => s !== skillName
    );

    await this.saveContext(context);
  }

  /**
   * Remove a skill (add to manual excludes)
   */
  async excludeSkill(skillName: string): Promise<void> {
    const context = await this.loadContext();
    if (!context) return;

    if (!context.manual.exclude_skills.includes(skillName)) {
      context.manual.exclude_skills.push(skillName);
    }
    
    // Remove from includes if present
    context.manual.include_skills = context.manual.include_skills.filter(
      s => s !== skillName
    );

    await this.saveContext(context);
  }

  /**
   * Update config agent preference
   */
  async setAgentPreference(agent: 'auto' | 'claude' | 'copilot' | 'both'): Promise<void> {
    const config = await this.loadConfig();
    
    if (agent === 'both') {
      config.agent.sync_both = true;
    } else {
      config.agent.sync_both = false;
      if (agent !== 'auto') {
        config.agent.force = agent as 'claude' | 'copilot';
      } else {
        delete config.agent.force;
      }
    }

    await this.saveConfig(config);
  }

  /**
   * Get cache directory path
   */
  getCachePath(): string {
    return path.join(this.projectPath, '.mcp/mother/cache');
  }

  /**
   * Merge loaded config with defaults
   */
  private mergeWithDefaults(loaded: Partial<MotherConfig>): MotherConfig {
    return {
      version: loaded.version || DEFAULT_CONFIG.version,
      agent: {
        ...DEFAULT_CONFIG.agent,
        ...loaded.agent
      },
      registry: loaded.registry || DEFAULT_CONFIG.registry,
      install_path: loaded.install_path,
      agent_overrides: loaded.agent_overrides,
      cache: {
        ...DEFAULT_CONFIG.cache,
        ...loaded.cache
      },
      detection: {
        ...DEFAULT_CONFIG.detection,
        ...loaded.detection
      },
      skills: {
        ...DEFAULT_CONFIG.skills,
        ...loaded.skills
      },
      sync: {
        ...DEFAULT_CONFIG.sync,
        ...loaded.sync
      }
    };
  }
}

/**
 * Generate default config content as a string (for display)
 */
export function getDefaultConfigString(): string {
  return yaml.stringify(DEFAULT_CONFIG, { indent: 2 });
}
