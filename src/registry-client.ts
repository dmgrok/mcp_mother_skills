/**
 * Registry Client - Fetches skills and bundles from GitHub registries
 * 
 * Skills and bundles are consumed from the agent_skills_directory:
 * - Skills: https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json
 * - Bundles: https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/bundles.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { RegistrySource, RegistryIndex, RegistrySkill, SkillBundle } from './types.js';

// Bundles URL from the agent_skills_directory
const BUNDLES_URL = 'https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/bundles.json';

interface BundlesIndex {
  version: string;
  generated_at: string;
  total_bundles: number;
  bundles: SkillBundle[];
}

interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url?: string;
  content?: string;
  encoding?: string;
}

interface CachedRegistry {
  source: string;
  fetched_at: string;
  index: RegistryIndex;
}

interface CachedBundles {
  fetched_at: string;
  bundles: SkillBundle[];
}

export class RegistryClient {
  private registries: RegistrySource[];
  private cachePath: string;
  private cacheMaxAgeDays: number;
  private cachedBundles: SkillBundle[] | null = null;

  constructor(
    registries: RegistrySource[],
    cachePath: string,
    cacheMaxAgeDays: number = 7
  ) {
    this.registries = registries.sort((a, b) => a.priority - b.priority);
    this.cachePath = cachePath;
    this.cacheMaxAgeDays = cacheMaxAgeDays;
  }

  /**
   * Get all skills from all registries (using cache when valid)
   */
  async getAllSkills(forceRefresh: boolean = false): Promise<RegistrySkill[]> {
    const allSkills: RegistrySkill[] = [];
    const seenSkills = new Set<string>();

    for (const registry of this.registries) {
      try {
        const index = await this.getRegistryIndex(registry, forceRefresh);
        
        for (const skill of index.skills) {
          // Higher priority registries take precedence
          if (!seenSkills.has(skill.name)) {
            seenSkills.add(skill.name);
            const resolvedPath = skill.path && skill.path.startsWith('http')
              ? skill.path
              : `${registry.url}/${skill.path}`;

            allSkills.push({
              ...skill,
              // Add source info
              path: resolvedPath
            });
          }
        }
      } catch (error) {
        console.error(`Failed to fetch registry ${registry.url}:`, error);
      }
    }

    return allSkills;
  }

  /**
   * Get all bundles from the agent_skills_directory
   * Fetches from: https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/bundles.json
   */
  async getAllBundles(forceRefresh: boolean = false): Promise<SkillBundle[]> {
    // Return cached bundles if available and not forcing refresh
    if (this.cachedBundles && !forceRefresh) {
      return this.cachedBundles;
    }

    // Try to load from disk cache
    if (!forceRefresh) {
      const cached = await this.loadBundlesCache();
      if (cached) {
        this.cachedBundles = cached;
        return cached;
      }
    }

    // Fetch from the bundles URL
    try {
      const response = await fetch(BUNDLES_URL, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'mcp-mother-skills'
        }
      });

      if (!response.ok) {
        console.error(`Failed to fetch bundles: ${response.status}`);
        return [];
      }

      const data = await response.json() as BundlesIndex;
      this.cachedBundles = data.bundles || [];
      
      // Save to cache
      await this.saveBundlesCache(this.cachedBundles);
      
      return this.cachedBundles;
    } catch (error) {
      console.error('Failed to fetch bundles from agent_skills_directory:', error);
      return [];
    }
  }

  /**
   * Load bundles from disk cache
   */
  private async loadBundlesCache(): Promise<SkillBundle[] | null> {
    try {
      const cachePath = path.join(this.cachePath, 'bundles-cache.json');
      const content = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(content) as CachedBundles;
      
      // Check if cache is still valid
      const cacheAge = Date.now() - new Date(cached.fetched_at).getTime();
      const maxAge = this.cacheMaxAgeDays * 24 * 60 * 60 * 1000;
      
      if (cacheAge < maxAge) {
        return cached.bundles;
      }
    } catch {
      // Cache doesn't exist or is invalid
    }
    return null;
  }

  /**
   * Save bundles to disk cache
   */
  private async saveBundlesCache(bundles: SkillBundle[]): Promise<void> {
    try {
      await fs.mkdir(this.cachePath, { recursive: true });
      const cachePath = path.join(this.cachePath, 'bundles-cache.json');
      const cached: CachedBundles = {
        fetched_at: new Date().toISOString(),
        bundles
      };
      await fs.writeFile(cachePath, JSON.stringify(cached, null, 2));
    } catch (error) {
      console.error('Failed to save bundles cache:', error);
    }
  }

  /**
   * Get a specific bundle by ID
   */
  async getBundle(id: string): Promise<SkillBundle | null> {
    const bundles = await this.getAllBundles();
    return bundles.find(b => b.id === id) || null;
  }

  /**
   * Search bundles by query and/or tags
   */
  async searchBundles(query?: string, tags?: string[]): Promise<SkillBundle[]> {
    const allBundles = await this.getAllBundles();
    
    return allBundles.filter(bundle => {
      // Query match
      if (query) {
        const queryLower = query.toLowerCase();
        const matchesQuery = 
          bundle.id.toLowerCase().includes(queryLower) ||
          bundle.name.toLowerCase().includes(queryLower) ||
          bundle.description.toLowerCase().includes(queryLower) ||
          bundle.use_cases.some(uc => uc.toLowerCase().includes(queryLower));
        if (!matchesQuery) return false;
      }

      // Tags match
      if (tags && tags.length > 0) {
        const bundleTags = bundle.tags || [];
        const matchesTags = tags.some(tag => 
          bundleTags.includes(tag.toLowerCase())
        );
        if (!matchesTags) return false;
      }

      return true;
    });
  }

  /**
   * Search skills by query and/or tags
   */
  async searchSkills(query?: string, tags?: string[]): Promise<RegistrySkill[]> {
    const allSkills = await this.getAllSkills();
    
    return allSkills.filter(skill => {
      // Query match
      if (query) {
        const queryLower = query.toLowerCase();
        const matchesQuery = 
          skill.name.toLowerCase().includes(queryLower) ||
          skill.description.toLowerCase().includes(queryLower);
        if (!matchesQuery) return false;
      }

      // Tags match
      if (tags && tags.length > 0) {
        const skillTags = skill.tags || [];
        const matchesTags = tags.some(tag => 
          skillTags.includes(tag.toLowerCase())
        );
        if (!matchesTags) return false;
      }

      return true;
    });
  }

  /**
   * Get a specific skill by name
   */
  async getSkill(name: string): Promise<RegistrySkill | null> {
    const allSkills = await this.getAllSkills();
    return allSkills.find(s => s.name === name) || null;
  }

  /**
   * Fetch the SKILL.md content for a skill
   */
  async fetchSkillContent(skill: RegistrySkill): Promise<string> {
    // Parse the GitHub URL to get owner, repo, and path
    const urlMatch = skill.path.match(
      /github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+)?\/(.+)/
    );
    
    if (!urlMatch) {
      throw new Error(`Invalid skill path: ${skill.path}`);
    }

    const [, owner, repo, skillPath] = urlMatch;
    const skillMdUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${skillPath}/SKILL.md`;

    const response = await fetch(skillMdUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'mcp-mother-skills'
      }
    });

    if (!response.ok) {
      // Try raw.githubusercontent.com as fallback
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillPath}/SKILL.md`;
      const rawResponse = await fetch(rawUrl);
      
      if (!rawResponse.ok) {
        throw new Error(`Failed to fetch skill content: ${response.status}`);
      }
      
      return await rawResponse.text();
    }

    const data: GitHubContent = await response.json();
    
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    if (data.download_url) {
      const contentResponse = await fetch(data.download_url);
      return await contentResponse.text();
    }

    throw new Error('Could not retrieve skill content');
  }

  /**
   * Fetch additional resources for a skill (scripts, templates, etc.)
   */
  async fetchSkillResources(skill: RegistrySkill): Promise<Map<string, string>> {
    const resources = new Map<string, string>();
    
    const urlMatch = skill.path.match(
      /github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+)?\/(.+)/
    );
    
    if (!urlMatch) return resources;

    const [, owner, repo, skillPath] = urlMatch;
    const resourcesUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${skillPath}/resources`;

    try {
      const response = await fetch(resourcesUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'mcp-mother-skills'
        }
      });

      if (!response.ok) return resources;

      const contents: GitHubContent[] = await response.json();

      for (const item of contents) {
        if (item.type === 'file' && item.download_url) {
          const contentResponse = await fetch(item.download_url);
          const content = await contentResponse.text();
          resources.set(item.name, content);
        }
      }
    } catch {
      // Resources are optional
    }

    return resources;
  }

  /**
   * Get registry index (from cache or fetch)
   */
  private async getRegistryIndex(
    registry: RegistrySource,
    forceRefresh: boolean
  ): Promise<RegistryIndex> {
    const cacheFile = this.getCacheFilePath(registry.url);

    // Try to load from cache
    if (!forceRefresh) {
      const cached = await this.loadFromCache(cacheFile);
      if (cached && this.isCacheValid(cached.fetched_at)) {
        return cached.index;
      }
    }

    // Fetch from registry
    const index = await this.fetchRegistryIndex(registry);
    
    // Save to cache
    await this.saveToCache(cacheFile, {
      source: registry.url,
      fetched_at: new Date().toISOString(),
      index
    });

    return index;
  }

  /**
   * Fetch registry index from GitHub
   */
  private async fetchRegistryIndex(registry: RegistrySource): Promise<RegistryIndex> {
    // Direct catalog URLs (.json or .toon) are fetched and parsed without GitHub scanning
    if (registry.url.endsWith('.json')) {
      const response = await fetch(registry.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch registry index: ${response.status}`);
      }
      const json = await response.json();
      return this.parseJsonCatalog(json);
    }

    if (registry.url.endsWith('.toon')) {
      const response = await fetch(registry.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch registry index: ${response.status}`);
      }
      const content = await response.text();
      return this.parseToonCatalog(content);
    }

    // Parse GitHub URL
    const urlMatch = registry.url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlMatch) {
      throw new Error(`Invalid registry URL: ${registry.url}`);
    }

    const [, owner, repo] = urlMatch;

    // Try to fetch registry.yaml first
    const registryYamlUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/registry.yaml`;
    
    try {
      const response = await fetch(registryYamlUrl);
      if (response.ok) {
        const content = await response.text();
        // Parse YAML (simple parsing, for production use yaml library)
        return this.parseRegistryYaml(content, registry.url);
      }
    } catch {
      // Fall back to scanning skills directory
    }

    // Scan the skills directory
    return await this.scanSkillsDirectory(owner, repo, registry.url);
  }

  /**
   * Parse registry.yaml content
   */
  private parseRegistryYaml(content: string, sourceUrl: string): RegistryIndex {
    // Import yaml dynamically
    const yaml = require('yaml');
    const parsed = yaml.parse(content);

    return {
      version: parsed.version || '1.0',
      last_updated: parsed.last_updated || new Date().toISOString(),
      skills: (parsed.skills || []).map((skill: any) => ({
        name: skill.name,
        path: `${sourceUrl}/tree/main/${skill.path}`,
        version: skill.version || '1.0.0',
        description: skill.description || '',
        triggers: skill.triggers || {},
        dependencies: skill.dependencies || [],
        tags: skill.tags || [],
        last_updated: skill.last_updated
      }))
    };
  }

  /**
   * Parse JSON catalog (cdn/registry) format
   */
  private parseJsonCatalog(json: any): RegistryIndex {
    const skills = (json.skills || []).map((skill: any) => {
      const repo = skill.source?.repo;
      const skillPath = skill.source?.path;
      const path = repo && skillPath
        ? `${repo}/tree/main/${skillPath}`
        : skill.path || skill.id;

      return {
        name: skill.name || skill.id,
        path,
        version: skill.version || '1.0.0',
        description: skill.description || '',
        triggers: skill.triggers || {},
        dependencies: skill.dependencies || [],
        tags: (skill.tags || []).map((t: any) => String(t)),
        last_updated: skill.source?.commit_sha || json.generated_at
      } as RegistrySkill;
    });

    return {
      version: json.version || '1.0',
      last_updated: json.generated_at || new Date().toISOString(),
      skills
    };
  }

  /**
   * Parse .toon catalog format (custom, yaml-like)
   */
  private parseToonCatalog(content: string): RegistryIndex {
    const yaml = require('yaml');

    const normalizeList = (line: string, indent: string): string => {
      const [, list] = line.split(':');
      const items = (list || '').split(',').map((v: string) => v.trim()).filter(Boolean);
      const itemIndent = `${indent}  `;
      return `${indent}${line.trim().startsWith('tags[') ? 'tags' : 'categories'}:\n${items.map(i => `${itemIndent}- ${i}`).join('\n')}`;
    };

    let normalized = content.replace(/\r/g, '');
    normalized = normalized.replace(/^skills\[\d+\]:/m, 'skills:');
    normalized = normalized.replace(/^(\s*)categories\[\d+\]:.*$/m, (match: string, indent: string) => normalizeList(match, indent || ''));
    normalized = normalized.replace(/^(\s*)tags\[\d+\]:.*$/gm, (match: string, indent: string) => normalizeList(match, indent || '    '));

    const parsed = yaml.parse(normalized);
    const skills = (parsed?.skills || []).map((skill: any) => {
      const repo = skill.source?.repo;
      const skillPath = skill.source?.path;
      const path = repo && skillPath
        ? `${repo}/tree/main/${skillPath}`
        : skill.path || skill.id;

      return {
        name: skill.name || skill.id,
        path,
        version: skill.version || '1.0.0',
        description: skill.description || '',
        triggers: skill.triggers || {},
        dependencies: skill.dependencies || [],
        tags: (skill.tags || []).map((t: any) => String(t)),
        last_updated: skill.source?.commit_sha || parsed?.generated_at
      } as RegistrySkill;
    });

    return {
      version: parsed?.version || '1.0',
      last_updated: parsed?.generated_at || new Date().toISOString(),
      skills
    };
  }

  /**
   * Scan skills directory when no registry.yaml exists
   */
  private async scanSkillsDirectory(
    owner: string,
    repo: string,
    sourceUrl: string
  ): Promise<RegistryIndex> {
    const skills: RegistrySkill[] = [];
    const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/skills`;

    const response = await fetch(contentsUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'mcp-mother-skills'
      }
    });

    if (!response.ok) {
      return { version: '1.0', last_updated: new Date().toISOString(), skills: [] };
    }

    const contents: GitHubContent[] = await response.json();

    for (const item of contents) {
      if (item.type === 'dir') {
        // Try to fetch SKILL.md for this skill
        const skillMdUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${item.name}/SKILL.md`;
        
        try {
          const skillResponse = await fetch(skillMdUrl);
          if (skillResponse.ok) {
            const skillContent = await skillResponse.text();
            const metadata = this.parseSkillMetadata(skillContent);

            skills.push({
              name: metadata.name || item.name,
              path: `${sourceUrl}/tree/main/skills/${item.name}`,
              version: metadata.version || '1.0.0',
              description: metadata.description || '',
              triggers: this.inferTriggers(item.name),
              dependencies: metadata.dependencies || [],
              tags: metadata.tags || [],
              last_updated: metadata.last_updated
            });
          }
        } catch {
          // Skip skills without SKILL.md
        }
      }
    }

    return {
      version: '1.0',
      last_updated: new Date().toISOString(),
      skills
    };
  }

  /**
   * Parse SKILL.md frontmatter
   */
  private parseSkillMetadata(content: string): Partial<RegistrySkill> {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return {};

    const yaml = require('yaml');
    try {
      return yaml.parse(frontmatterMatch[1]);
    } catch {
      return {};
    }
  }

  /**
   * Infer triggers from skill name
   */
  private inferTriggers(skillName: string): RegistrySkill['triggers'] {
    // Basic inference based on skill name
    const triggers: RegistrySkill['triggers'] = {};
    
    const packageMap: Record<string, string[]> = {
      'typescript': ['typescript'],
      'react': ['react', 'react-dom'],
      'nextjs': ['next'],
      'vue': ['vue'],
      'angular': ['@angular/core'],
      'express': ['express'],
      'fastapi': ['fastapi'],
      'postgresql': ['pg', 'psycopg2'],
      'mongodb': ['mongodb', 'mongoose'],
      'docker': [],
      'kubernetes': [],
      'github-actions': []
    };

    const fileMap: Record<string, string[]> = {
      'typescript': ['tsconfig.json'],
      'nextjs': ['next.config.js', 'next.config.mjs'],
      'docker': ['Dockerfile'],
      'kubernetes': ['k8s/**/*.yaml'],
      'github-actions': ['.github/workflows/*.yaml']
    };

    if (packageMap[skillName]) {
      triggers.packages = packageMap[skillName];
    }

    if (fileMap[skillName]) {
      triggers.files = fileMap[skillName];
    }

    return triggers;
  }

  /**
   * Cache helpers
   */
  private getCacheFilePath(url: string): string {
    const urlHash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
    return path.join(this.cachePath, `registry_${urlHash}.json`);
  }

  private async loadFromCache(cacheFile: string): Promise<CachedRegistry | null> {
    try {
      const content = await fs.readFile(cacheFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async saveToCache(cacheFile: string, data: CachedRegistry): Promise<void> {
    try {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  private isCacheValid(fetchedAt: string): boolean {
    const fetchDate = new Date(fetchedAt);
    const now = new Date();
    const diffDays = (now.getTime() - fetchDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays < this.cacheMaxAgeDays;
  }
}
