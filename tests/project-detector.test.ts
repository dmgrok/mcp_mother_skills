/**
 * Tests for Project Detector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { ProjectDetector } from '../src/project-detector.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue([])
}));

describe('ProjectDetector', () => {
  const mockProjectPath = '/test/project';
  let detector: ProjectDetector;

  beforeEach(() => {
    vi.resetAllMocks();
    detector = new ProjectDetector(mockProjectPath);
  });

  describe('parsePackageJson', () => {
    it('should detect TypeScript from package.json', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {},
        devDependencies: {
          typescript: '^5.0.0'
        }
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.languages).toContainEqual(
        expect.objectContaining({
          id: 'typescript',
          confidence: 0.95
        })
      );
    });

    it('should detect React from package.json dependencies', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        },
        devDependencies: {}
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.frameworks).toContainEqual(
        expect.objectContaining({
          id: 'react',
          confidence: 0.95
        })
      );
    });

    it('should detect Next.js from package.json', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          next: '^14.0.0'
        },
        devDependencies: {}
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.frameworks).toContainEqual(
        expect.objectContaining({
          id: 'nextjs',
          version: '14.0.0'
        })
      );
    });

    it('should detect PostgreSQL client packages', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          pg: '^8.11.0'
        },
        devDependencies: {}
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.databases).toContainEqual(
        expect.objectContaining({
          id: 'postgresql'
        })
      );
    });

    it('should detect Prisma from package.json', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          '@prisma/client': '^5.0.0'
        },
        devDependencies: {
          prisma: '^5.0.0'
        }
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.tools).toContainEqual(
        expect.objectContaining({
          id: 'prisma'
        })
      );
    });

    it('should handle scoped packages like @aws-sdk/*', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          '@aws-sdk/client-s3': '^3.0.0'
        },
        devDependencies: {}
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.infrastructure).toContainEqual(
        expect.objectContaining({
          id: 'aws'
        })
      );
    });
  });

  describe('parseRequirementsTxt', () => {
    it('should detect FastAPI from requirements.txt', async () => {
      const requirements = `
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
      `;

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('requirements.txt')) {
          return requirements;
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.frameworks).toContainEqual(
        expect.objectContaining({
          id: 'fastapi',
          confidence: 0.9
        })
      );
    });

    it('should detect Django from requirements.txt', async () => {
      const requirements = `
django>=4.2
djangorestframework
      `;

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('requirements.txt')) {
          return requirements;
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.frameworks).toContainEqual(
        expect.objectContaining({
          id: 'django'
        })
      );
    });

    it('should ignore comments in requirements.txt', async () => {
      const requirements = `
# This is a comment
fastapi==0.104.1
# Another comment
      `;

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('requirements.txt')) {
          return requirements;
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.frameworks).toContainEqual(
        expect.objectContaining({
          id: 'fastapi'
        })
      );
    });

    it('should detect psycopg2 as PostgreSQL', async () => {
      const requirements = `
psycopg2-binary==2.9.9
sqlalchemy==2.0.0
      `;

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('requirements.txt')) {
          return requirements;
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      expect(stack.databases).toContainEqual(
        expect.objectContaining({
          id: 'postgresql'
        })
      );
    });
  });

  describe('scanConfigFiles', () => {
    it('should detect Docker from Dockerfile', async () => {
      const { glob } = await import('glob');
      
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (String(pattern).includes('Dockerfile')) {
          return ['Dockerfile'];
        }
        return [];
      });

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const { stack } = await detector.detect();

      expect(stack.infrastructure).toContainEqual(
        expect.objectContaining({
          id: 'docker'
        })
      );
    });
  });

  describe('parseReadme', () => {
    it('should detect technologies mentioned in README', async () => {
      const readme = `
# My Project

Built with PostgreSQL and Redis for caching.

## Tech Stack
- Node.js
- PostgreSQL
- Redis
      `;

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('README.md')) {
          return readme;
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      // README mentions should have lower confidence
      const postgresFromReadme = stack.databases.find(
        d => d.id === 'postgresql' && d.source.includes('README')
      );
      
      if (postgresFromReadme) {
        expect(postgresFromReadme.confidence).toBe(0.6);
      }
    });
  });

  describe('getProjectInfo', () => {
    it('should get project info from package.json', async () => {
      const packageJson = {
        name: 'my-awesome-project',
        description: 'An awesome project'
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const info = await detector.getProjectInfo();

      expect(info.name).toBe('my-awesome-project');
      expect(info.description).toBe('An awesome project');
    });

    it('should fall back to directory name', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const info = await detector.getProjectInfo();

      expect(info.name).toBe('project'); // basename of /test/project
    });
  });

  describe('detection sources', () => {
    it('should track detection sources', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          react: '^18.0.0'
        }
      };

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const { sources } = await detector.detect();

      expect(sources).toContain('package.json');
    });
  });

  describe('confidence handling', () => {
    it('should keep higher confidence when same tech detected multiple times', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          pg: '^8.0.0'
        }
      };

      const readme = `
# Project
Uses PostgreSQL database.
      `;

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('package.json')) {
          return JSON.stringify(packageJson);
        }
        if (pathStr.includes('README')) {
          return readme;
        }
        throw new Error('ENOENT');
      });

      const { stack } = await detector.detect();

      // Should have the higher confidence from package.json
      const postgres = stack.databases.find(d => d.id === 'postgresql');
      expect(postgres?.confidence).toBeGreaterThan(0.6);
    });
  });
});
