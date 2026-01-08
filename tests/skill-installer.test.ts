/**
 * Tests for Skill Installer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillInstaller } from '../src/skill-installer.js';
import { RegistryClient } from '../src/registry-client.js';
import { AGENT_PROFILES } from '../src/agent-profiles.js';
import { DetectedStack, MotherConfig, RegistrySkill, InstalledSkill } from '../src/types.js';

// Mock fs
vi.mock('fs/promises');

describe('SkillInstaller', () => {
  const mockProjectPath = '/test/project';
  let installer: SkillInstaller;
  let mockRegistryClient: RegistryClient;
  let mockConfig: MotherConfig;

  const defaultConfig: MotherConfig = {
    version: '1.0',
    agent: {
      mode: 'auto',
      sync_both: false
    },
    registry: [{ url: 'https://github.com/anthropics/skills', priority: 1 }],
    cache: {
      refresh_interval_days: 7,
      registry_cache: '.mcp/mother/cache'
    },
    detection: {
      enabled: true,
      sources: []
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

  const mockSkills: RegistrySkill[] = [
    {
      name: 'typescript',
      path: 'https://github.com/anthropics/skills/tree/main/skills/typescript',
      version: '1.0.0',
      description: 'TypeScript skill',
      triggers: { packages: ['typescript'] },
      tags: ['language']
    },
    {
      name: 'react',
      path: 'https://github.com/anthropics/skills/tree/main/skills/react',
      version: '1.0.0',
      description: 'React skill',
      triggers: { packages: ['react'] },
      dependencies: ['typescript'],
      tags: ['framework']
    },
    {
      name: 'nextjs',
      path: 'https://github.com/anthropics/skills/tree/main/skills/nextjs',
      version: '1.0.0',
      description: 'Next.js skill',
      triggers: { packages: ['next'] },
      dependencies: ['typescript', 'react'],
      tags: ['framework']
    }
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    mockConfig = { ...defaultConfig };

    // Create mock registry client
    mockRegistryClient = {
      getAllSkills: vi.fn().mockResolvedValue(mockSkills),
      getSkill: vi.fn().mockImplementation((name) => 
        Promise.resolve(mockSkills.find(s => s.name === name) || null)
      ),
      searchSkills: vi.fn().mockResolvedValue(mockSkills),
      fetchSkillContent: vi.fn().mockResolvedValue(`---
name: test-skill
version: "1.0.0"
---
# Test Skill
`),
      fetchSkillResources: vi.fn().mockResolvedValue(new Map())
    } as unknown as RegistryClient;

    installer = new SkillInstaller(
      mockProjectPath,
      mockConfig,
      mockRegistryClient,
      AGENT_PROFILES.claude
    );
  });

  describe('syncSkills', () => {
    it('should install matched skills', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const result = await installer.syncSkills(detectedStack, [], {});

      expect(result.added).toContainEqual(
        expect.objectContaining({ name: 'typescript' })
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should resolve dependencies', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [],
        frameworks: [{ id: 'nextjs', confidence: 0.95, source: 'package.json' }],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const result = await installer.syncSkills(detectedStack, [], {});

      // Should install nextjs + dependencies (typescript, react)
      const addedNames = result.added.map(s => s.name);
      expect(addedNames).toContain('nextjs');
      expect(addedNames).toContain('typescript');
      expect(addedNames).toContain('react');
    });

    it('should report unchanged skills', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const installedSkills: InstalledSkill[] = [
        {
          name: 'typescript',
          version: '1.0.0', // Same version
          source: 'anthropics/skills',
          installed_at: '2026-01-01',
          path: '.claude/skills/typescript'
        }
      ];

      const result = await installer.syncSkills(detectedStack, installedSkills, {});

      expect(result.unchanged).toContainEqual(
        expect.objectContaining({ name: 'typescript' })
      );
    });

    it('should report updated skills', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const installedSkills: InstalledSkill[] = [
        {
          name: 'typescript',
          version: '0.9.0', // Older version
          source: 'anthropics/skills',
          installed_at: '2026-01-01',
          path: '.claude/skills/typescript'
        }
      ];

      const result = await installer.syncSkills(detectedStack, installedSkills, {});

      expect(result.updated).toContainEqual(
        expect.objectContaining({ 
          name: 'typescript',
          version: '1.0.0',
          oldVersion: '0.9.0'
        })
      );
    });

    it('should respect always_include config', async () => {
      mockConfig.skills.always_include = ['react'];

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const result = await installer.syncSkills(detectedStack, [], {});

      expect(result.added.map(s => s.name)).toContain('react');
    });

    it('should respect always_exclude config', async () => {
      const excludeConfig = { ...mockConfig, skills: { ...mockConfig.skills, always_exclude: ['typescript'] } };
      const excludeInstaller = new SkillInstaller(
        mockProjectPath,
        excludeConfig,
        mockRegistryClient,
        AGENT_PROFILES.claude
      );

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const result = await excludeInstaller.syncSkills(detectedStack, [], {});

      expect(result.added.map(s => s.name)).not.toContain('typescript');
    });

    it('should support dry run mode', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const result = await installer.syncSkills(detectedStack, [], { dryRun: true });

      // Should report skills that would be added
      expect(result.added.length).toBeGreaterThan(0);
      expect(result.added.map(s => s.name)).toContain('typescript');
      // Should not actually write files in dry run mode
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should install to both agents when sync_both is true', async () => {
      mockConfig.agent.sync_both = true;

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const result = await installer.syncSkills(detectedStack, [], {});

      expect(result.agent).toContain('claude');
      expect(result.agent).toContain('copilot');
      expect(result.paths.length).toBe(2);
    });

    it('should remove skills when auto_remove is true', async () => {
      mockConfig.sync.auto_remove = true;

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rm).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const installedSkills: InstalledSkill[] = [
        {
          name: 'old-skill',
          version: '1.0.0',
          source: 'anthropics/skills',
          installed_at: '2026-01-01',
          path: '.claude/skills/old-skill'
        }
      ];

      const result = await installer.syncSkills(detectedStack, installedSkills, {});

      expect(result.removed).toContainEqual(
        expect.objectContaining({ name: 'old-skill' })
      );
    });
  });

  describe('installSkill', () => {
    it('should create skill directory and write SKILL.md', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const skill = mockSkills[0];
      const installPath = path.join(mockProjectPath, '.claude/skills');

      await installer.installSkill(skill, installPath);

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(installPath, 'typescript'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(installPath, 'typescript', 'SKILL.md'),
        expect.any(String)
      );
    });

    it('should write resources when available', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const resources = new Map([
        ['template.ts', '// Template'],
        ['config.json', '{}']
      ]);
      vi.mocked(mockRegistryClient.fetchSkillResources).mockResolvedValue(resources);

      const skill = mockSkills[0];
      const installPath = path.join(mockProjectPath, '.claude/skills');

      await installer.installSkill(skill, installPath);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(installPath, 'typescript', 'resources', 'template.ts'),
        '// Template'
      );
    });
  });

  describe('uninstallSkill', () => {
    it('should remove skill directory', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const installPath = path.join(mockProjectPath, '.claude/skills');
      await installer.uninstallSkill('typescript', installPath);

      expect(fs.rm).toHaveBeenCalledWith(
        path.join(installPath, 'typescript'),
        { recursive: true }
      );
    });
  });

  describe('installSkillByName', () => {
    it('should install skill by name', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await installer.installSkillByName('typescript');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('typescript');
    });

    it('should return null for unknown skill', async () => {
      vi.mocked(mockRegistryClient.getSkill).mockResolvedValue(null);

      const result = await installer.installSkillByName('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getInstalledSkills', () => {
    it('should list installed skills', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'typescript', isDirectory: () => true },
        { name: 'react', isDirectory: () => true }
      ] as any);

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        return `---
name: test
version: "1.0.0"
---
# Test`;
      });

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date('2026-01-01')
      } as any);

      const installed = await installer.getInstalledSkills();

      expect(installed).toHaveLength(2);
    });

    it('should return empty array when no skills installed', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      const installed = await installer.getInstalledSkills();

      expect(installed).toEqual([]);
    });
  });

  describe('agent-specific paths', () => {
    it('should use Claude paths for Claude agent', () => {
      const claudeInstaller = new SkillInstaller(
        mockProjectPath,
        mockConfig,
        mockRegistryClient,
        AGENT_PROFILES.claude
      );

      // The default path for Claude should be .claude/skills
      expect(AGENT_PROFILES.claude.projectSkillPaths[0]).toBe('.claude/skills');
    });

    it('should use Copilot paths for Copilot agent', () => {
      const copilotInstaller = new SkillInstaller(
        mockProjectPath,
        mockConfig,
        mockRegistryClient,
        AGENT_PROFILES.copilot
      );

      // The default path for Copilot should be .github/skills
      expect(AGENT_PROFILES.copilot.projectSkillPaths[0]).toBe('.github/skills');
    });

    it('should respect config path override', async () => {
      mockConfig.install_path = 'custom/skills';

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const detectedStack: DetectedStack = {
        languages: [{ id: 'typescript', confidence: 0.95, source: 'package.json' }],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: []
      };

      const result = await installer.syncSkills(detectedStack, [], {});

      expect(result.paths[0]).toContain('custom/skills');
    });
  });
});
