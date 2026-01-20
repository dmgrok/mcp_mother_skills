/**
 * Tests for Config Manager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigManager, getDefaultConfigString } from '../src/config-manager.js';
import { DetectedStack } from '../src/types.js';

// Mock fs and yaml
vi.mock('fs/promises');

describe('ConfigManager', () => {
  const mockProjectPath = '/test/project';
  let configManager: ConfigManager;

  beforeEach(() => {
    vi.resetAllMocks();
    configManager = new ConfigManager(mockProjectPath);
  });

  describe('loadConfig', () => {
    it('should load config from file', async () => {
      const configYaml = `
version: "1.0"
agent:
  mode: claude
  sync_both: true
registry:
  - url: "https://github.com/anthropics/skills"
    priority: 1
cache:
  refresh_interval_days: 14
detection:
  enabled: true
skills:
  always_include:
    - typescript
  always_exclude: []
sync:
  auto_remove: true
`;

      vi.mocked(fs.readFile).mockResolvedValue(configYaml);

      const config = await configManager.loadConfig();

      expect(config.agent.mode).toBe('claude');
      expect(config.agent.sync_both).toBe(true);
      expect(config.cache.refresh_interval_days).toBe(14);
      expect(config.skills.always_include).toContain('typescript');
      expect(config.sync.auto_remove).toBe(true);
    });

    it('should return default config when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const config = await configManager.loadConfig();

      expect(config.version).toBe('1.0');
      expect(config.agent.mode).toBe('auto');
      expect(config.agent.sync_both).toBe(false);
      expect(config.cache.refresh_interval_days).toBe(7);
    });

    it('should merge partial config with defaults', async () => {
      const partialConfig = `
agent:
  mode: copilot
`;

      vi.mocked(fs.readFile).mockResolvedValue(partialConfig);

      const config = await configManager.loadConfig();

      expect(config.agent.mode).toBe('copilot');
      expect(config.agent.sync_both).toBe(false); // Default
      expect(config.cache.refresh_interval_days).toBe(7); // Default
    });

    it('should fall back to default registry when none provided', async () => {
      const emptyRegistryConfig = `
agent:
  mode: auto
registry: []
`;

      vi.mocked(fs.readFile).mockResolvedValue(emptyRegistryConfig);

      const config = await configManager.loadConfig();

      expect(config.registry).toEqual([
        {
          url: 'https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json',
          priority: 1
        }
      ]);
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = await configManager.loadConfig();
      config.agent.mode = 'copilot';

      await configManager.saveConfig(config);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.mcp/mother'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalled();
      
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(String(writeCall[0])).toContain('config.yaml');
      expect(writeCall[1]).toContain('copilot');
    });
  });

  describe('initializeConfig', () => {
    it('should return existing config if file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(`
agent:
  mode: claude
`);

      const config = await configManager.initializeConfig();

      expect(config.agent.mode).toBe('claude');
    });

    it('should create default config if file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = await configManager.initializeConfig();

      expect(fs.writeFile).toHaveBeenCalled();
      expect(config.version).toBe('1.0');
    });
  });

  describe('loadContext', () => {
    it('should load project context from file', async () => {
      const contextYaml = `
generated_at: "2026-01-08T10:00:00Z"
detection_sources:
  - package.json
project:
  name: test-project
  description: A test project
detected:
  languages:
    - id: typescript
      confidence: 0.95
      source: package.json
  frameworks: []
  databases: []
  infrastructure: []
  tools: []
installed_skills: []
manual:
  include_skills: []
  exclude_skills: []
`;

      vi.mocked(fs.readFile).mockResolvedValue(contextYaml);

      const context = await configManager.loadContext();

      expect(context?.project.name).toBe('test-project');
      expect(context?.detected.languages[0].id).toBe('typescript');
    });

    it('should return null when context file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const context = await configManager.loadContext();

      expect(context).toBeNull();
    });
  });

  describe('saveContext', () => {
    it('should save project context to file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const context = {
        generated_at: new Date().toISOString(),
        detection_sources: ['package.json'],
        project: { name: 'test', description: 'Test project' },
        detected: {
          languages: [],
          frameworks: [],
          databases: [],
          infrastructure: [],
          tools: []
        },
        installed_skills: [],
        manual: {
          include_skills: [],
          exclude_skills: []
        }
      };

      await configManager.saveContext(context);

      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(String(writeCall[0])).toContain('project-context.yaml');
    });
  });

  describe('updateContext', () => {
    it('should preserve manual settings when updating context', async () => {
      const existingContext = `
generated_at: "2026-01-07T10:00:00Z"
detection_sources:
  - package.json
project:
  name: old-name
detected:
  languages: []
  frameworks: []
  databases: []
  infrastructure: []
  tools: []
installed_skills: []
manual:
  include_skills:
    - custom-skill
  exclude_skills:
    - unwanted-skill
  context_notes: "Important notes"
`;

      vi.mocked(fs.readFile).mockResolvedValue(existingContext);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const context = await configManager.updateContext(
        { name: 'new-name', description: 'New description' },
        detectedStack,
        ['package.json'],
        []
      );

      expect(context.project.name).toBe('new-name');
      expect(context.manual.include_skills).toContain('custom-skill');
      expect(context.manual.exclude_skills).toContain('unwanted-skill');
    });
  });

  describe('addManualSkill', () => {
    it('should add skill to manual includes', async () => {
      const existingContext = `
generated_at: "2026-01-08T10:00:00Z"
detection_sources: []
project:
  name: test
detected:
  languages: []
  frameworks: []
  databases: []
  infrastructure: []
  tools: []
installed_skills: []
manual:
  include_skills: []
  exclude_skills:
    - new-skill
`;

      vi.mocked(fs.readFile).mockResolvedValue(existingContext);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.addManualSkill('new-skill');

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedContent = String(writeCall[1]);
      
      expect(savedContent).toContain('new-skill');
      // Should be removed from excludes
      expect(savedContent.match(/exclude_skills:[\s\S]*?new-skill/)).toBeFalsy();
    });
  });

  describe('excludeSkill', () => {
    it('should add skill to manual excludes', async () => {
      const existingContext = `
generated_at: "2026-01-08T10:00:00Z"
detection_sources: []
project:
  name: test
detected:
  languages: []
  frameworks: []
  databases: []
  infrastructure: []
  tools: []
installed_skills: []
manual:
  include_skills:
    - unwanted-skill
  exclude_skills: []
`;

      vi.mocked(fs.readFile).mockResolvedValue(existingContext);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.excludeSkill('unwanted-skill');

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedContent = String(writeCall[1]);
      
      // Should be in excludes
      expect(savedContent).toMatch(/exclude_skills:[\s\S]*?unwanted-skill/);
    });
  });

  describe('setAgentPreference', () => {
    it('should set agent to both', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.setAgentPreference('both');

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedContent = String(writeCall[1]);
      
      expect(savedContent).toContain('sync_both: true');
    });

    it('should set agent to claude', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.setAgentPreference('claude');

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedContent = String(writeCall[1]);
      
      expect(savedContent).toContain('force: claude');
    });

    it('should reset to auto', async () => {
      const existingConfig = `
agent:
  mode: auto
  sync_both: true
  force: claude
`;
      vi.mocked(fs.readFile).mockResolvedValue(existingConfig);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await configManager.setAgentPreference('auto');

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedContent = String(writeCall[1]);
      
      expect(savedContent).toContain('sync_both: false');
      expect(savedContent).not.toContain('force:');
    });
  });

  describe('getCachePath', () => {
    it('should return correct cache path', () => {
      const cachePath = configManager.getCachePath();

      expect(cachePath).toBe(path.join(mockProjectPath, '.mcp/mother/cache'));
    });
  });

  describe('getDefaultConfigString', () => {
    it('should return valid YAML string', () => {
      const configString = getDefaultConfigString();

      expect(configString).toContain('version:');
      expect(configString).toContain('agent:');
      expect(configString).toContain('registry:');
      expect(configString).toContain('cache:');
    });
  });
});
