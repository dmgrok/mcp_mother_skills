/**
 * Enhanced Project Detector - Tiered detection strategy
 * 
 * Tier 1: GitHub SBOM API (most accurate for package dependencies)
 * Tier 2: @specfy/stack-analyser (700+ technologies, infrastructure, SaaS)
 * Tier 3: Local detection fallback (offline, no external deps)
 */

import { analyser, FSProvider, flatten, tech, Payload } from '@specfy/stack-analyser';
import '@specfy/stack-analyser/dist/autoload.js';

import { GitHubSBOMClient } from './github-sbom-client.js';
import { ProjectDetector } from './project-detector.js';
import {
  DetectedStack,
  DetectedTechnology,
  EnhancedDetectionConfig,
  EnhancedDetectionResult,
  SBOMPackage,
  GitHubConfig,
  DetectionSource,
} from './types.js';

// Map Specfy tech types to our stack categories
const SPECFY_CATEGORY_MAP: Record<string, keyof DetectedStack> = {
  'language': 'languages',
  'runtime': 'languages',
  'framework': 'frameworks',
  'library': 'frameworks',
  'database': 'databases',
  'queue': 'databases',
  'cache': 'databases',
  'storage': 'databases',
  'hosting': 'infrastructure',
  'ci': 'infrastructure',
  'cloud': 'infrastructure',
  'container': 'infrastructure',
  'iaas': 'infrastructure',
  'paas': 'infrastructure',
  'monitoring': 'tools',
  'tool': 'tools',
  'analytics': 'tools',
  'auth': 'tools',
  'saas': 'tools',
  'app': 'tools',
};

// Map SBOM ecosystems to tech stack triggers
const ECOSYSTEM_TECH_MAP: Record<string, { id: string; category: keyof DetectedStack }> = {
  'npm': { id: 'javascript', category: 'languages' },
  'pip': { id: 'python', category: 'languages' },
  'pypi': { id: 'python', category: 'languages' },
  'cargo': { id: 'rust', category: 'languages' },
  'rubygems': { id: 'ruby', category: 'languages' },
  'gem': { id: 'ruby', category: 'languages' },
  'golang': { id: 'go', category: 'languages' },
  'go': { id: 'go', category: 'languages' },
  'maven': { id: 'java', category: 'languages' },
  'nuget': { id: 'csharp', category: 'languages' },
  'composer': { id: 'php', category: 'languages' },
  'pub': { id: 'dart', category: 'languages' },
  'swift': { id: 'swift', category: 'languages' },
  'hex': { id: 'elixir', category: 'languages' },
};

// Package name to framework/tool mapping
const PACKAGE_FRAMEWORK_MAP: Record<string, { id: string; category: keyof DetectedStack }> = {
  // JavaScript/TypeScript frameworks
  'react': { id: 'react', category: 'frameworks' },
  'react-dom': { id: 'react', category: 'frameworks' },
  'next': { id: 'nextjs', category: 'frameworks' },
  'vue': { id: 'vue', category: 'frameworks' },
  '@angular/core': { id: 'angular', category: 'frameworks' },
  'svelte': { id: 'svelte', category: 'frameworks' },
  'express': { id: 'express', category: 'frameworks' },
  'fastify': { id: 'fastify', category: 'frameworks' },
  '@nestjs/core': { id: 'nestjs', category: 'frameworks' },
  'hono': { id: 'hono', category: 'frameworks' },
  
  // Python frameworks
  'django': { id: 'django', category: 'frameworks' },
  'flask': { id: 'flask', category: 'frameworks' },
  'fastapi': { id: 'fastapi', category: 'frameworks' },
  
  // Databases
  'pg': { id: 'postgresql', category: 'databases' },
  'postgres': { id: 'postgresql', category: 'databases' },
  'psycopg2': { id: 'postgresql', category: 'databases' },
  'mysql': { id: 'mysql', category: 'databases' },
  'mysql2': { id: 'mysql', category: 'databases' },
  'mongodb': { id: 'mongodb', category: 'databases' },
  'mongoose': { id: 'mongodb', category: 'databases' },
  'redis': { id: 'redis', category: 'databases' },
  'ioredis': { id: 'redis', category: 'databases' },
  'sqlite3': { id: 'sqlite', category: 'databases' },
  'better-sqlite3': { id: 'sqlite', category: 'databases' },
  
  // ORMs/Query builders
  'prisma': { id: 'prisma', category: 'tools' },
  '@prisma/client': { id: 'prisma', category: 'tools' },
  'drizzle-orm': { id: 'drizzle', category: 'tools' },
  'typeorm': { id: 'typeorm', category: 'tools' },
  'sequelize': { id: 'sequelize', category: 'tools' },
  
  // Testing
  'jest': { id: 'jest', category: 'tools' },
  'vitest': { id: 'vitest', category: 'tools' },
  'mocha': { id: 'mocha', category: 'tools' },
  'pytest': { id: 'pytest', category: 'tools' },
  'playwright': { id: 'playwright', category: 'tools' },
  '@playwright/test': { id: 'playwright', category: 'tools' },
  'cypress': { id: 'cypress', category: 'tools' },
  
  // Build tools
  'vite': { id: 'vite', category: 'tools' },
  'webpack': { id: 'webpack', category: 'tools' },
  'esbuild': { id: 'esbuild', category: 'tools' },
  'rollup': { id: 'rollup', category: 'tools' },
  'turbo': { id: 'turborepo', category: 'tools' },
  
  // Linting/Formatting
  'eslint': { id: 'eslint', category: 'tools' },
  'prettier': { id: 'prettier', category: 'tools' },
  'biome': { id: 'biome', category: 'tools' },
  
  // CSS
  'tailwindcss': { id: 'tailwindcss', category: 'tools' },
  'styled-components': { id: 'styled-components', category: 'tools' },
  
  // Cloud SDKs
  '@aws-sdk/client-s3': { id: 'aws', category: 'infrastructure' },
  'aws-sdk': { id: 'aws', category: 'infrastructure' },
  'boto3': { id: 'aws', category: 'infrastructure' },
  '@google-cloud/storage': { id: 'gcp', category: 'infrastructure' },
  '@azure/storage-blob': { id: 'azure', category: 'infrastructure' },
};

export class EnhancedProjectDetector {
  private projectPath: string;
  private config: EnhancedDetectionConfig;
  private githubClient: GitHubSBOMClient | null = null;
  private localDetector: ProjectDetector;

  constructor(projectPath: string, config?: Partial<EnhancedDetectionConfig>) {
    this.projectPath = projectPath;
    this.config = {
      useGitHubSBOM: true,
      useSpecfy: true,
      useLocalFallback: true,
      ...config,
    };

    // Initialize local detector as fallback
    this.localDetector = new ProjectDetector(projectPath);
  }

  /**
   * Initialize GitHub client by detecting repo info from git remote
   * Call this before detect() to enable GitHub SBOM detection from local repos
   */
  async initialize(): Promise<void> {
    if (this.config.useGitHubSBOM && !this.githubClient) {
      // First try config, then detect from git remote
      const githubConfig = this.config.github || 
        await GitHubSBOMClient.detectFromGitRemote(this.projectPath);
      
      if (githubConfig.owner && githubConfig.repo) {
        this.githubClient = new GitHubSBOMClient(githubConfig);
      }
    }
  }

  /**
   * Run enhanced detection using tiered strategy
   */
  async detect(): Promise<EnhancedDetectionResult> {
    // Auto-initialize GitHub client if not already done
    if (this.config.useGitHubSBOM && !this.githubClient) {
      await this.initialize();
    }

    const result: EnhancedDetectionResult = {
      stack: {
        languages: [],
        frameworks: [],
        databases: [],
        infrastructure: [],
        tools: [],
      },
      sources: [],
    };

    // Tier 1: Try GitHub SBOM API
    if (this.config.useGitHubSBOM && this.githubClient) {
      try {
        const sbomResult = await this.githubClient.fetchSBOM();
        if (sbomResult && sbomResult.packages.length > 0) {
          result.sources.push('github-sbom');
          result.packages = sbomResult.packages;
          this.mergeFromSBOM(result.stack, sbomResult.packages);
        }
      } catch (error) {
        console.warn('GitHub SBOM detection failed:', error);
      }
    }

    // Tier 2: Use Specfy for comprehensive detection
    if (this.config.useSpecfy) {
      try {
        const specfyResult = await this.runSpecfyAnalysis();
        if (specfyResult) {
          result.sources.push('specfy');
          result.rawSpecfy = specfyResult;
          this.mergeFromSpecfy(result.stack, specfyResult);
        }
      } catch (error) {
        console.warn('Specfy detection failed:', error);
      }
    }

    // Tier 3: Fall back to local detection
    if (this.config.useLocalFallback) {
      // Always run local detection to catch things others might miss
      // or as primary source if others fail
      try {
        const localResult = await this.localDetector.detect();
        if (localResult.stack) {
          result.sources.push('local');
          this.mergeFromLocal(result.stack, localResult.stack);
        }
      } catch (error) {
        console.warn('Local detection failed:', error);
      }
    }

    return result;
  }

  /**
   * Run Specfy stack analyser
   */
  private async runSpecfyAnalysis(): Promise<Payload | null> {
    try {
      const analysisResult = await analyser({
        provider: new FSProvider({
          path: this.projectPath,
        }),
      });

      return flatten(analysisResult);
    } catch (error) {
      console.error('Specfy analysis error:', error);
      return null;
    }
  }

  /**
   * Merge detections from GitHub SBOM packages
   */
  private mergeFromSBOM(stack: DetectedStack, packages: SBOMPackage[]): void {
    const seen = new Set<string>();

    for (const pkg of packages) {
      // Add language detection from ecosystem
      const ecosystemTech = ECOSYSTEM_TECH_MAP[pkg.ecosystem];
      if (ecosystemTech && !seen.has(ecosystemTech.id)) {
        seen.add(ecosystemTech.id);
        this.addDetection(stack, ecosystemTech.category, {
          id: ecosystemTech.id,
          confidence: 0.95,
          source: `github-sbom (${pkg.ecosystem})`,
        });
      }

      // Add framework/tool detection from package name
      const frameworkTech = PACKAGE_FRAMEWORK_MAP[pkg.name];
      if (frameworkTech && !seen.has(frameworkTech.id)) {
        seen.add(frameworkTech.id);
        this.addDetection(stack, frameworkTech.category, {
          id: frameworkTech.id,
          version: pkg.version,
          confidence: 0.95,
          source: `github-sbom (${pkg.name})`,
        });
      }
    }
  }

  /**
   * Merge detections from Specfy analysis
   */
  private mergeFromSpecfy(stack: DetectedStack, payload: Payload): void {
    // Extract techs from the flattened payload
    for (const techKey of payload.techs) {
      const techInfo = tech.indexed[techKey];
      if (!techInfo) continue;

      const category = SPECFY_CATEGORY_MAP[techInfo.type] || 'tools';
      
      this.addDetection(stack, category, {
        id: techKey,
        name: techInfo.name,
        confidence: 0.9,
        source: `specfy (${techInfo.type})`,
      });
    }

    // Also check childs for additional techs
    for (const child of payload.childs) {
      for (const techKey of child.techs) {
        const techInfo = tech.indexed[techKey];
        if (!techInfo) continue;

        const category = SPECFY_CATEGORY_MAP[techInfo.type] || 'tools';
        
        this.addDetection(stack, category, {
          id: techKey,
          name: techInfo.name,
          confidence: 0.85, // Slightly lower for nested
          source: `specfy (${techInfo.type})`,
        });
      }
    }

    // Extract languages from the payload
    for (const [lang, _count] of Object.entries(payload.languages)) {
      const langKey = lang.toLowerCase();
      // Map common language names to our ids
      const langMap: Record<string, string> = {
        'typescript': 'typescript',
        'javascript': 'javascript',
        'python': 'python',
        'ruby': 'ruby',
        'go': 'go',
        'rust': 'rust',
        'java': 'java',
        'kotlin': 'kotlin',
        'swift': 'swift',
        'php': 'php',
        'csharp': 'csharp',
        'c#': 'csharp',
        'c++': 'cplusplus',
        'cpp': 'cplusplus',
        'c': 'c',
      };
      
      const id = langMap[langKey] || langKey;
      this.addDetection(stack, 'languages', {
        id,
        name: lang,
        confidence: 0.85,
        source: 'specfy (language detection)',
      });
    }
  }

  /**
   * Merge detections from local detector
   */
  private mergeFromLocal(target: DetectedStack, source: DetectedStack): void {
    for (const category of Object.keys(source) as Array<keyof DetectedStack>) {
      for (const tech of source[category]) {
        this.addDetection(target, category, tech);
      }
    }
  }

  /**
   * Add a detection to the stack, avoiding duplicates
   */
  private addDetection(
    stack: DetectedStack,
    category: keyof DetectedStack,
    detection: DetectedTechnology
  ): void {
    const existing = stack[category].find(d => d.id === detection.id);
    
    if (existing) {
      // Keep higher confidence detection
      if (detection.confidence > existing.confidence) {
        Object.assign(existing, detection);
      }
      // Merge version if we have one and existing doesn't
      if (detection.version && !existing.version) {
        existing.version = detection.version;
      }
    } else {
      stack[category].push(detection);
    }
  }

  /**
   * Get project info (delegates to local detector)
   */
  async getProjectInfo(): Promise<{ name: string; description?: string }> {
    return this.localDetector.getProjectInfo();
  }

  /**
   * Configure GitHub settings for SBOM fetching
   */
  setGitHubConfig(config: GitHubConfig): void {
    this.config.github = config;
    if (config.owner && config.repo) {
      this.githubClient = new GitHubSBOMClient(config);
    }
  }
}

/**
 * Factory function to create enhanced detector with sensible defaults
 */
export function createEnhancedDetector(
  projectPath: string,
  options?: {
    github?: GitHubConfig;
    disableGitHub?: boolean;
    disableSpecfy?: boolean;
    disableLocal?: boolean;
  }
): EnhancedProjectDetector {
  return new EnhancedProjectDetector(projectPath, {
    useGitHubSBOM: !options?.disableGitHub,
    useSpecfy: !options?.disableSpecfy,
    useLocalFallback: !options?.disableLocal,
    github: options?.github,
  });
}
