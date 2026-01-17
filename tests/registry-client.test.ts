/**
 * Tests for Registry Client
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { RegistryClient } from '../src/registry-client.js';
import { RegistrySource } from '../src/types.js';

// Mock fs
vi.mock('fs/promises');

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('RegistryClient', () => {
  const mockCachePath = '/test/cache';
  const mockRegistries: RegistrySource[] = [
    { url: 'https://github.com/anthropics/skills', priority: 1 },
    { url: 'https://github.com/myorg/skills', priority: 2 }
  ];

  let client: RegistryClient;

  beforeEach(() => {
    vi.resetAllMocks();
    client = new RegistryClient(mockRegistries, mockCachePath, 7);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllSkills', () => {
    it('should fetch skills from registry', async () => {
      const registryYaml = `
version: "1.0"
last_updated: "2026-01-05"
skills:
  - name: typescript
    path: skills/typescript
    version: "1.0.0"
    description: "TypeScript skill"
    triggers:
      packages: ["typescript"]
    tags: [language]
  - name: react
    path: skills/react
    version: "1.0.0"
    description: "React skill"
    triggers:
      packages: ["react"]
    tags: [framework]
`;

      // Mock cache miss
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Mock fetch for registry.yaml
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(registryYaml)
      });

      const skills = await client.getAllSkills();

      expect(skills).toHaveLength(2);
      expect(skills[0].name).toBe('typescript');
      expect(skills[1].name).toBe('react');
    });

    it('should use cached registry when valid', async () => {
      const cachedData = {
        source: 'https://github.com/anthropics/skills',
        fetched_at: new Date().toISOString(), // Fresh cache
        index: {
          version: '1.0',
          last_updated: '2026-01-05',
          skills: [
            {
              name: 'cached-skill',
              path: 'skills/cached-skill',
              version: '1.0.0',
              description: 'Cached skill',
              triggers: {}
            }
          ]
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cachedData));

      const skills = await client.getAllSkills();

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('cached-skill');
      expect(mockFetch).not.toHaveBeenCalled(); // Should not fetch
    });

    it('should refresh cache when expired', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old

      const cachedData = {
        source: 'https://github.com/anthropics/skills',
        fetched_at: oldDate.toISOString(),
        index: {
          version: '1.0',
          last_updated: '2026-01-01',
          skills: []
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cachedData));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const registryYaml = `
version: "1.0"
skills:
  - name: fresh-skill
    path: skills/fresh-skill
    version: "1.0.0"
    description: "Fresh skill"
    triggers: {}
`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(registryYaml)
      });

      const skills = await client.getAllSkills();

      expect(mockFetch).toHaveBeenCalled();
      expect(skills[0].name).toBe('fresh-skill');
    });

    it('should force refresh when requested', async () => {
      const cachedData = {
        source: 'https://github.com/anthropics/skills',
        fetched_at: new Date().toISOString(),
        index: {
          version: '1.0',
          skills: [{ name: 'old-skill', path: 'skills/old', version: '1.0.0', description: '', triggers: {} }]
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cachedData));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const registryYaml = `
version: "1.0"
skills:
  - name: new-skill
    path: skills/new
    version: "2.0.0"
    description: "New skill"
    triggers: {}
`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(registryYaml)
      });

      const skills = await client.getAllSkills(true); // Force refresh

      expect(mockFetch).toHaveBeenCalled();
      expect(skills[0].name).toBe('new-skill');
    });

    it('should prioritize higher priority registries', async () => {
      // First registry (priority 1) has typescript
      // Second registry (priority 2) also has typescript with different version
      
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(`
version: "1.0"
skills:
  - name: typescript
    path: skills/typescript
    version: "1.0.0"
    description: "TypeScript from primary"
    triggers: {}
`)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(`
version: "1.0"
skills:
  - name: typescript
    path: skills/typescript
    version: "2.0.0"
    description: "TypeScript from secondary"
    triggers: {}
`)
        });

      const skills = await client.getAllSkills();

      // Should only have one typescript, from priority 1
      const tsSkills = skills.filter(s => s.name === 'typescript');
      expect(tsSkills).toHaveLength(1);
      expect(tsSkills[0].version).toBe('1.0.0');
    });

    it('should parse toon catalog format', async () => {
      const toonRegistry: RegistrySource[] = [
        { url: 'https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.toon', priority: 1 }
      ];

      const toonClient = new RegistryClient(toonRegistry, mockCachePath, 7);

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const toonContent = `
$schema: "https://raw.githubusercontent.com/dmgrok/agent_skills_directory/main/schema/catalog-schema.json"
version: 2026.01.09
generated_at: "2026-01-09T13:28:40.037090+00:00"
total_skills: 1
categories[1]: development
skills[1]:
  - id: demo/skill
    name: demo-skill
    description: "Demo skill"
    provider: demo
    category: development
    source:
      repo: "https://github.com/demo/skills"
      path: skills/demo
      skill_md_url: "https://raw.githubusercontent.com/demo/skills/main/skills/demo/SKILL.md"
      commit_sha: abc123
    tags[2]: foo,bar
`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(toonContent)
      } as any);

      const skills = await toonClient.getAllSkills();

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('demo-skill');
      expect(skills[0].path).toBe('https://github.com/demo/skills/tree/main/skills/demo');
      expect(skills[0].tags).toEqual(['foo', 'bar']);
    });
  });

  describe('searchSkills', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
version: "1.0"
skills:
  - name: typescript
    path: skills/typescript
    version: "1.0.0"
    description: "TypeScript development"
    triggers: {}
    tags: [language, frontend, backend]
  - name: react
    path: skills/react
    version: "1.0.0"
    description: "React framework"
    triggers: {}
    tags: [framework, frontend]
  - name: postgresql
    path: skills/postgresql
    version: "1.0.0"
    description: "PostgreSQL database"
    triggers: {}
    tags: [database, backend]
`)
      });
    });

    it('should search by query', async () => {
      const skills = await client.searchSkills('typescript');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('typescript');
    });

    it('should search by description', async () => {
      const skills = await client.searchSkills('framework');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('react');
    });

    it('should search by tags', async () => {
      const skills = await client.searchSkills(undefined, ['frontend']);

      expect(skills).toHaveLength(2);
      expect(skills.map(s => s.name)).toContain('typescript');
      expect(skills.map(s => s.name)).toContain('react');
    });

    it('should combine query and tags', async () => {
      const skills = await client.searchSkills('type', ['backend']);

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('typescript');
    });
  });

  describe('getSkill', () => {
    it('should get skill by name', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
version: "1.0"
skills:
  - name: typescript
    path: skills/typescript
    version: "1.0.0"
    description: "TypeScript"
    triggers: {}
`)
      });

      const skill = await client.getSkill('typescript');

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('typescript');
    });

    it('should return null for unknown skill', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`
version: "1.0"
skills: []
`)
      });

      const skill = await client.getSkill('nonexistent');

      expect(skill).toBeNull();
    });
  });

  describe('fetchSkillContent', () => {
    it('should fetch SKILL.md content', async () => {
      const skillContent = `---
name: typescript
version: "1.0.0"
description: "TypeScript skill"
---

# TypeScript

Instructions for TypeScript development.
`;

      // Mock the GitHub API response with base64 encoded content
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: Buffer.from(skillContent).toString('base64'),
          encoding: 'base64'
        })
      });

      const skill = {
        name: 'typescript',
        path: 'https://github.com/anthropics/skills/tree/main/skills/typescript',
        version: '1.0.0',
        description: 'TypeScript',
        triggers: {}
      };

      const content = await client.fetchSkillContent(skill);

      expect(content).toContain('TypeScript');
      expect(content).toContain('Instructions');
    });

    it('should fall back to raw URL on API failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('# Fallback content')
        });

      const skill = {
        name: 'typescript',
        path: 'https://github.com/anthropics/skills/tree/main/skills/typescript',
        version: '1.0.0',
        description: 'TypeScript',
        triggers: {}
      };

      const content = await client.fetchSkillContent(skill);

      expect(content).toBe('# Fallback content');
    });
  });

  describe('fetchSkillResources', () => {
    it('should fetch additional resources', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { name: 'template.ts', type: 'file', download_url: 'https://example.com/template.ts' }
          ])
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('// Template content')
        });

      const skill = {
        name: 'typescript',
        path: 'https://github.com/anthropics/skills/tree/main/skills/typescript',
        version: '1.0.0',
        description: 'TypeScript',
        triggers: {}
      };

      const resources = await client.fetchSkillResources(skill);

      expect(resources.size).toBe(1);
      expect(resources.get('template.ts')).toBe('// Template content');
    });

    it('should return empty map when no resources', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const skill = {
        name: 'typescript',
        path: 'https://github.com/anthropics/skills/tree/main/skills/typescript',
        version: '1.0.0',
        description: 'TypeScript',
        triggers: {}
      };

      const resources = await client.fetchSkillResources(skill);

      expect(resources.size).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle registry fetch errors gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      mockFetch.mockRejectedValue(new Error('Network error'));

      const skills = await client.getAllSkills();

      // Should return empty array, not throw
      expect(skills).toEqual([]);
    });
  });
});
