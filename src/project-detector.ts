/**
 * Project Detector - Scans project files to detect tech stack
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { DetectedStack, DetectedTechnology } from './types.js';

interface PackageJson {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface PyProjectToml {
  project?: {
    name?: string;
    description?: string;
    dependencies?: string[];
  };
  tool?: {
    poetry?: {
      dependencies?: Record<string, unknown>;
    };
  };
}

// Mapping of packages/files to skill triggers
const SKILL_TRIGGERS: Record<string, { 
  category: keyof DetectedStack; 
  packages?: string[]; 
  files?: string[];
  readmeKeywords?: string[];
}> = {
  // Languages
  typescript: {
    category: 'languages',
    packages: ['typescript'],
    files: ['tsconfig.json', '*.ts', '*.tsx']
  },
  python: {
    category: 'languages',
    files: ['*.py', 'pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile']
  },
  rust: {
    category: 'languages',
    files: ['Cargo.toml', '*.rs']
  },
  go: {
    category: 'languages',
    files: ['go.mod', 'go.sum', '*.go']
  },
  java: {
    category: 'languages',
    files: ['pom.xml', 'build.gradle', '*.java']
  },
  csharp: {
    category: 'languages',
    files: ['*.csproj', '*.cs', '*.sln']
  },

  // Frontend Frameworks
  react: {
    category: 'frameworks',
    packages: ['react', 'react-dom']
  },
  nextjs: {
    category: 'frameworks',
    packages: ['next'],
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts']
  },
  vue: {
    category: 'frameworks',
    packages: ['vue'],
    files: ['vue.config.js', 'nuxt.config.js']
  },
  angular: {
    category: 'frameworks',
    packages: ['@angular/core'],
    files: ['angular.json']
  },
  svelte: {
    category: 'frameworks',
    packages: ['svelte'],
    files: ['svelte.config.js']
  },
  vite: {
    category: 'tools',
    packages: ['vite'],
    files: ['vite.config.js', 'vite.config.ts']
  },

  // Backend Frameworks
  express: {
    category: 'frameworks',
    packages: ['express']
  },
  fastify: {
    category: 'frameworks',
    packages: ['fastify']
  },
  nestjs: {
    category: 'frameworks',
    packages: ['@nestjs/core']
  },
  fastapi: {
    category: 'frameworks',
    packages: ['fastapi']
  },
  django: {
    category: 'frameworks',
    packages: ['django'],
    files: ['manage.py']
  },
  flask: {
    category: 'frameworks',
    packages: ['flask']
  },

  // Databases
  postgresql: {
    category: 'databases',
    packages: ['pg', 'postgres', 'psycopg2', 'psycopg2-binary', 'asyncpg'],
    readmeKeywords: ['postgresql', 'postgres']
  },
  mongodb: {
    category: 'databases',
    packages: ['mongodb', 'mongoose', 'pymongo'],
    readmeKeywords: ['mongodb', 'mongo']
  },
  mysql: {
    category: 'databases',
    packages: ['mysql', 'mysql2', 'mysqlclient'],
    readmeKeywords: ['mysql']
  },
  redis: {
    category: 'databases',
    packages: ['redis', 'ioredis'],
    readmeKeywords: ['redis']
  },
  sqlite: {
    category: 'databases',
    packages: ['sqlite3', 'better-sqlite3'],
    files: ['*.sqlite', '*.db']
  },
  prisma: {
    category: 'tools',
    packages: ['prisma', '@prisma/client'],
    files: ['prisma/schema.prisma']
  },
  drizzle: {
    category: 'tools',
    packages: ['drizzle-orm'],
    files: ['drizzle.config.ts']
  },

  // Infrastructure
  docker: {
    category: 'infrastructure',
    files: ['Dockerfile', 'docker-compose.yaml', 'docker-compose.yml', '.dockerignore']
  },
  kubernetes: {
    category: 'infrastructure',
    files: ['k8s/**/*.yaml', 'kubernetes/**/*.yaml', 'helm/**/*.yaml'],
    readmeKeywords: ['kubernetes', 'k8s']
  },
  terraform: {
    category: 'infrastructure',
    files: ['*.tf', 'terraform/**/*.tf']
  },
  'github-actions': {
    category: 'infrastructure',
    files: ['.github/workflows/*.yaml', '.github/workflows/*.yml']
  },
  aws: {
    category: 'infrastructure',
    packages: ['@aws-sdk/*', 'aws-sdk', 'boto3'],
    files: ['serverless.yml', 'sam.yaml', 'template.yaml'],
    readmeKeywords: ['aws', 'amazon web services']
  },

  // Testing
  jest: {
    category: 'tools',
    packages: ['jest'],
    files: ['jest.config.js', 'jest.config.ts']
  },
  vitest: {
    category: 'tools',
    packages: ['vitest'],
    files: ['vitest.config.ts']
  },
  playwright: {
    category: 'tools',
    packages: ['playwright', '@playwright/test'],
    files: ['playwright.config.ts']
  },
  pytest: {
    category: 'tools',
    packages: ['pytest'],
    files: ['pytest.ini', 'conftest.py']
  },

  // Other tools
  eslint: {
    category: 'tools',
    packages: ['eslint'],
    files: ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js']
  },
  prettier: {
    category: 'tools',
    packages: ['prettier'],
    files: ['.prettierrc', 'prettier.config.js']
  },
  tailwindcss: {
    category: 'tools',
    packages: ['tailwindcss'],
    files: ['tailwind.config.js', 'tailwind.config.ts']
  },
  graphql: {
    category: 'tools',
    packages: ['graphql', '@apollo/client', 'apollo-server'],
    files: ['*.graphql', 'schema.graphql']
  }
};

export class ProjectDetector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  async detect(): Promise<{ stack: DetectedStack; sources: string[] }> {
    const stack: DetectedStack = {
      languages: [],
      frameworks: [],
      databases: [],
      infrastructure: [],
      tools: []
    };
    const sources: string[] = [];

    // 1. Parse package.json (Node.js projects)
    const packageJsonResult = await this.parsePackageJson();
    if (packageJsonResult) {
      sources.push('package.json');
      this.mergeDetections(stack, packageJsonResult);
    }

    // 2. Parse requirements.txt (Python)
    const requirementsResult = await this.parseRequirementsTxt();
    if (requirementsResult) {
      sources.push('requirements.txt');
      this.mergeDetections(stack, requirementsResult);
    }

    // 3. Parse pyproject.toml (Python)
    const pyprojectResult = await this.parsePyprojectToml();
    if (pyprojectResult) {
      sources.push('pyproject.toml');
      this.mergeDetections(stack, pyprojectResult);
    }

    // 4. Scan for config files
    const configResult = await this.scanConfigFiles();
    if (configResult.length > 0) {
      sources.push('config files');
      for (const detection of configResult) {
        this.addDetection(stack, detection);
      }
    }

    // 5. Parse README for technology mentions
    const readmeResult = await this.parseReadme();
    if (readmeResult.length > 0) {
      sources.push('README.md');
      for (const detection of readmeResult) {
        this.addDetection(stack, detection);
      }
    }

    return { stack, sources };
  }

  private async parsePackageJson(): Promise<DetectedTechnology[] | null> {
    const pkgPath = path.join(this.projectPath, 'package.json');
    try {
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg: PackageJson = JSON.parse(content);
      const detections: DetectedTechnology[] = [];

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };

      // Check each trigger
      for (const [skillId, trigger] of Object.entries(SKILL_TRIGGERS)) {
        if (!trigger.packages) continue;

        for (const pkgPattern of trigger.packages) {
          // Handle scoped packages like @aws-sdk/*
          if (pkgPattern.includes('*')) {
            const prefix = pkgPattern.replace('/*', '');
            const matches = Object.keys(allDeps).filter(dep => dep.startsWith(prefix));
            if (matches.length > 0) {
              const version = allDeps[matches[0]];
              detections.push({
                id: skillId,
                version: version?.replace(/[\^~]/, ''),
                confidence: 0.95,
                source: `package.json (${matches[0]})`
              });
              break;
            }
          } else if (allDeps[pkgPattern]) {
            const version = allDeps[pkgPattern];
            detections.push({
              id: skillId,
              version: version?.replace(/[\^~]/, ''),
              confidence: 0.95,
              source: `package.json (${pkgPattern})`
            });
            break;
          }
        }
      }

      // Always detect Node.js/JavaScript if package.json exists
      detections.push({
        id: 'javascript',
        confidence: 0.9,
        source: 'package.json exists'
      });

      return detections;
    } catch {
      return null;
    }
  }

  private async parseRequirementsTxt(): Promise<DetectedTechnology[] | null> {
    const reqPath = path.join(this.projectPath, 'requirements.txt');
    try {
      const content = await fs.readFile(reqPath, 'utf-8');
      const detections: DetectedTechnology[] = [];
      const packages = new Set<string>();

      // Parse requirements.txt lines
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        // Extract package name (before ==, >=, etc.)
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
        if (match) {
          packages.add(match[1].toLowerCase());
        }
      }

      // Check each trigger
      for (const [skillId, trigger] of Object.entries(SKILL_TRIGGERS)) {
        if (!trigger.packages) continue;

        for (const pkgName of trigger.packages) {
          if (packages.has(pkgName.toLowerCase())) {
            detections.push({
              id: skillId,
              confidence: 0.9,
              source: `requirements.txt (${pkgName})`
            });
            break;
          }
        }
      }

      return detections;
    } catch {
      return null;
    }
  }

  private async parsePyprojectToml(): Promise<DetectedTechnology[] | null> {
    const pyprojectPath = path.join(this.projectPath, 'pyproject.toml');
    try {
      const content = await fs.readFile(pyprojectPath, 'utf-8');
      const detections: DetectedTechnology[] = [];
      
      // Simple TOML parsing for dependencies
      // Note: For production, use a proper TOML parser
      const packages = new Set<string>();

      // Match dependencies in [project.dependencies] or [tool.poetry.dependencies]
      const depMatches = content.matchAll(/["']([a-zA-Z0-9_-]+)["']/g);
      for (const match of depMatches) {
        packages.add(match[1].toLowerCase());
      }

      // Check each trigger
      for (const [skillId, trigger] of Object.entries(SKILL_TRIGGERS)) {
        if (!trigger.packages) continue;

        for (const pkgName of trigger.packages) {
          if (packages.has(pkgName.toLowerCase())) {
            detections.push({
              id: skillId,
              confidence: 0.85,
              source: `pyproject.toml (${pkgName})`
            });
            break;
          }
        }
      }

      return detections;
    } catch {
      return null;
    }
  }

  private async scanConfigFiles(): Promise<DetectedTechnology[]> {
    const detections: DetectedTechnology[] = [];

    for (const [skillId, trigger] of Object.entries(SKILL_TRIGGERS)) {
      if (!trigger.files) continue;

      for (const filePattern of trigger.files) {
        try {
          const matches = await glob(filePattern, {
            cwd: this.projectPath,
            nodir: true,
            ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
          });

          if (matches.length > 0) {
            detections.push({
              id: skillId,
              confidence: 0.9,
              source: `file: ${matches[0]}`
            });
            break;
          }
        } catch {
          // Glob error, continue
        }
      }
    }

    return detections;
  }

  private async parseReadme(): Promise<DetectedTechnology[]> {
    const detections: DetectedTechnology[] = [];
    const readmePaths = ['README.md', 'readme.md', 'README.MD', 'Readme.md'];

    let readmeContent = '';
    for (const readmePath of readmePaths) {
      try {
        readmeContent = await fs.readFile(
          path.join(this.projectPath, readmePath),
          'utf-8'
        );
        break;
      } catch {
        continue;
      }
    }

    if (!readmeContent) return detections;

    const contentLower = readmeContent.toLowerCase();

    for (const [skillId, trigger] of Object.entries(SKILL_TRIGGERS)) {
      if (!trigger.readmeKeywords) continue;

      for (const keyword of trigger.readmeKeywords) {
        if (contentLower.includes(keyword.toLowerCase())) {
          // Lower confidence for README mentions
          detections.push({
            id: skillId,
            confidence: 0.6,
            source: `README.md mentions "${keyword}"`
          });
          break;
        }
      }
    }

    return detections;
  }

  private mergeDetections(stack: DetectedStack, detections: DetectedTechnology[]): void {
    for (const detection of detections) {
      this.addDetection(stack, detection);
    }
  }

  private addDetection(stack: DetectedStack, detection: DetectedTechnology): void {
    const trigger = SKILL_TRIGGERS[detection.id];
    if (!trigger) return;

    const category = trigger.category;
    
    // Check if already detected with higher confidence
    const existing = stack[category].find(d => d.id === detection.id);
    if (existing) {
      if (detection.confidence > existing.confidence) {
        Object.assign(existing, detection);
      }
    } else {
      stack[category].push(detection);
    }
  }

  /**
   * Get project name and description from available sources
   */
  async getProjectInfo(): Promise<{ name: string; description?: string }> {
    // Try package.json first
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg: PackageJson = JSON.parse(content);
      if (pkg.name) {
        return { name: pkg.name, description: pkg.description };
      }
    } catch {
      // Continue to next source
    }

    // Try pyproject.toml
    try {
      const pyprojectPath = path.join(this.projectPath, 'pyproject.toml');
      const content = await fs.readFile(pyprojectPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
      if (nameMatch) {
        const descMatch = content.match(/description\s*=\s*["']([^"']+)["']/);
        return { name: nameMatch[1], description: descMatch?.[1] };
      }
    } catch {
      // Continue
    }

    // Fall back to directory name
    return { name: path.basename(this.projectPath) };
  }
}
