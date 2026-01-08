/**
 * Mother MCP Types
 */

// Agent types
export type AgentId = 'claude' | 'copilot' | 'codex' | 'generic';
export type AgentMode = 'auto' | 'claude' | 'copilot' | 'codex' | 'both';

export interface AgentProfile {
  id: AgentId;
  name: string;
  projectSkillPaths: string[];
  personalSkillPath: string;
  instructionsFile: string;
  customInstructionsPath: string;
}

// Registry types
export interface RegistrySource {
  url: string;
  priority: number;
  auth?: string;
}

export interface SkillTrigger {
  packages?: string[];
  files?: string[];
  readme_keywords?: string[];
  manual_only?: boolean;
}

export interface RegistrySkill {
  name: string;
  path: string;
  version: string;
  description: string;
  triggers: SkillTrigger;
  dependencies?: string[];
  tags?: string[];
  last_updated?: string;
}

export interface RegistryIndex {
  version: string;
  last_updated: string;
  skills: RegistrySkill[];
}

// Detection types
export interface DetectedTechnology {
  id: string;
  name?: string;
  version?: string;
  confidence: number;
  source: string;
}

export interface DetectedStack {
  languages: DetectedTechnology[];
  frameworks: DetectedTechnology[];
  databases: DetectedTechnology[];
  infrastructure: DetectedTechnology[];
  tools: DetectedTechnology[];
}

// Installed skill types
export interface InstalledSkill {
  name: string;
  version: string;
  source: string;
  installed_at: string;
  path: string;
  last_updated?: string;
}

// Project context types
export interface ProjectContext {
  generated_at: string;
  detection_sources: string[];
  project: {
    name: string;
    description?: string;
  };
  detected: DetectedStack;
  installed_skills: InstalledSkill[];
  manual: {
    include_skills: string[];
    exclude_skills: string[];
    context_notes?: string;
  };
}

// Config types
export interface CacheConfig {
  refresh_interval_days: number;
  registry_cache: string;
  last_refresh?: string;
}

export interface DetectionConfig {
  enabled: boolean;
  sources: {
    type: string;
    patterns?: string[];
    file?: string;
    extract?: string[];
  }[];
}

export interface AgentOverride {
  install_path?: string;
}

export interface MotherConfig {
  version: string;
  agent: {
    mode: AgentMode;
    sync_both: boolean;
    force?: AgentId;
  };
  registry: RegistrySource[];
  install_path?: string;
  agent_overrides?: Record<string, AgentOverride>;
  cache: CacheConfig;
  detection: DetectionConfig;
  skills: {
    always_include: string[];
    always_exclude: string[];
  };
  sync: {
    auto_remove: boolean;
    prompt_on_changes: boolean;
  };
}

// Sync result types
export interface SkillChange {
  name: string;
  version: string;
  oldVersion?: string;
}

export interface SyncResult {
  added: SkillChange[];
  updated: SkillChange[];
  removed: SkillChange[];
  unchanged: SkillChange[];
  agent: AgentId[];
  paths: string[];
  detected_stack: DetectedStack;
}

// Tool parameter types
export interface SyncSkillsParams {
  force_refresh?: boolean;
  dry_run?: boolean;
  agent?: AgentMode;
}

export interface SearchSkillsParams {
  query?: string;
  tags?: string[];
}

export interface InstallSkillParams {
  skill_name: string;
}

export interface UninstallSkillParams {
  skill_name: string;
}

export interface SetAgentPreferenceParams {
  agent: AgentMode;
}
