/**
 * Tests for GitHub SBOM Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubSBOMClient } from '../src/github-sbom-client.js';

describe('GitHubSBOMClient', () => {
  const mockSBOMResponse = {
    sbom: {
      SPDXID: 'SPDXRef-DOCUMENT',
      spdxVersion: 'SPDX-2.3',
      creationInfo: {
        created: '2024-01-15T00:00:00Z',
        creators: ['Tool: GitHub.com-Dependency-Graph'],
      },
      name: 'test/repo',
      dataLicense: 'CC0-1.0',
      documentNamespace: 'https://spdx.org/spdxdocs/test',
      packages: [
        {
          SPDXID: 'SPDXRef-Repository',
          name: 'test/repo',
          versionInfo: 'main',
          downloadLocation: 'NOASSERTION',
          filesAnalyzed: false,
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:github/test/repo@main',
            },
          ],
        },
        {
          SPDXID: 'SPDXRef-npm-react-18.2.0',
          name: 'npm:react',
          versionInfo: '18.2.0',
          downloadLocation: 'NOASSERTION',
          filesAnalyzed: false,
          licenseDeclared: 'MIT',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:npm/react@18.2.0',
            },
          ],
        },
        {
          SPDXID: 'SPDXRef-npm-lodash-4.17.21',
          name: 'npm:lodash',
          versionInfo: '4.17.21',
          downloadLocation: 'NOASSERTION',
          filesAnalyzed: false,
          licenseDeclared: 'MIT',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:npm/lodash@4.17.21',
            },
          ],
        },
        {
          SPDXID: 'SPDXRef-pypi-requests-2.28.0',
          name: 'pypi:requests',
          versionInfo: '2.28.0',
          downloadLocation: 'NOASSERTION',
          filesAnalyzed: false,
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:pypi/requests@2.28.0',
            },
          ],
        },
      ],
      relationships: [
        {
          relationshipType: 'DEPENDS_ON',
          spdxElementId: 'SPDXRef-Repository',
          relatedSpdxElement: 'SPDXRef-npm-react-18.2.0',
        },
        {
          relationshipType: 'DEPENDS_ON',
          spdxElementId: 'SPDXRef-npm-react-18.2.0',
          relatedSpdxElement: 'SPDXRef-npm-lodash-4.17.21',
        },
        {
          relationshipType: 'DESCRIBES',
          spdxElementId: 'SPDXRef-DOCUMENT',
          relatedSpdxElement: 'SPDXRef-Repository',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('returns true when owner and repo are provided', () => {
      const client = new GitHubSBOMClient({ owner: 'test', repo: 'repo' });
      expect(client.isConfigured()).toBe(true);
    });

    it('returns false when owner is missing', () => {
      const client = new GitHubSBOMClient({ repo: 'repo' });
      expect(client.isConfigured()).toBe(false);
    });

    it('returns false when repo is missing', () => {
      const client = new GitHubSBOMClient({ owner: 'test' });
      expect(client.isConfigured()).toBe(false);
    });
  });

  describe('fetchSBOM', () => {
    it('returns null when not configured', async () => {
      const client = new GitHubSBOMClient({});
      const result = await client.fetchSBOM();
      expect(result).toBeNull();
    });

    it('fetches and parses SBOM successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSBOMResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new GitHubSBOMClient({
        owner: 'test',
        repo: 'repo',
        token: 'ghp_test123',
      });

      const result = await client.fetchSBOM();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test/repo/dependency-graph/sbom',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/vnd.github+json',
            'Authorization': 'Bearer ghp_test123',
          }),
        })
      );

      expect(result).not.toBeNull();
      expect(result?.source).toBe('github-sbom');
      expect(result?.packages).toHaveLength(3);
    });

    it('parses packages with correct ecosystem mapping', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSBOMResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new GitHubSBOMClient({ owner: 'test', repo: 'repo' });
      const result = await client.fetchSBOM();

      const reactPkg = result?.packages.find(p => p.name === 'react');
      expect(reactPkg).toBeDefined();
      expect(reactPkg?.ecosystem).toBe('npm');
      expect(reactPkg?.version).toBe('18.2.0');
      expect(reactPkg?.license).toBe('MIT');
      expect(reactPkg?.relationship).toBe('direct');

      const lodashPkg = result?.packages.find(p => p.name === 'lodash');
      expect(lodashPkg).toBeDefined();
      expect(lodashPkg?.relationship).toBe('transitive');

      const requestsPkg = result?.packages.find(p => p.name === 'requests');
      expect(requestsPkg).toBeDefined();
      expect(requestsPkg?.ecosystem).toBe('pip');
    });

    it('returns null on 404 error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new GitHubSBOMClient({ owner: 'test', repo: 'nonexistent' });
      const result = await client.fetchSBOM();

      expect(result).toBeNull();
    });

    it('returns null on 403 rate limit error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new GitHubSBOMClient({ owner: 'test', repo: 'repo' });
      const result = await client.fetchSBOM();

      expect(result).toBeNull();
    });

    it('handles network errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const client = new GitHubSBOMClient({ owner: 'test', repo: 'repo' });
      const result = await client.fetchSBOM();

      expect(result).toBeNull();
    });
  });

  describe('detectFromEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('detects GitHub token from GITHUB_TOKEN', () => {
      process.env.GITHUB_TOKEN = 'ghp_test';
      const config = GitHubSBOMClient.detectFromEnvironment();
      expect(config.token).toBe('ghp_test');
    });

    it('detects GitHub token from GH_TOKEN', () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_PAT;
      process.env.GH_TOKEN = 'ghp_test2';
      const config = GitHubSBOMClient.detectFromEnvironment();
      expect(config.token).toBe('ghp_test2');
    });

    it('detects repo from GITHUB_REPOSITORY', () => {
      process.env.GITHUB_REPOSITORY = 'owner/repo-name';
      const config = GitHubSBOMClient.detectFromEnvironment();
      expect(config.owner).toBe('owner');
      expect(config.repo).toBe('repo-name');
    });
  });

  describe('parseGitHubUrl', () => {
    it('parses HTTPS URL with .git extension', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('https://github.com/owner/repo-name.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo-name' });
    });

    it('parses HTTPS URL without .git extension', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('https://github.com/myorg/my-project');
      expect(result).toEqual({ owner: 'myorg', repo: 'my-project' });
    });

    it('parses SSH URL format', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses SSH URL format without .git extension', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('git@github.com:my-org/project-name');
      expect(result).toEqual({ owner: 'my-org', repo: 'project-name' });
    });

    it('parses ssh:// protocol URL', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('ssh://git@github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('returns null for non-GitHub URLs', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('https://gitlab.com/owner/repo.git');
      expect(result).toBeNull();
    });

    it('returns null for invalid URLs', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('not a url');
      expect(result).toBeNull();
    });

    it('handles case-insensitive GitHub domain', () => {
      const result = GitHubSBOMClient.parseGitHubUrl('https://GITHUB.COM/Owner/Repo.git');
      expect(result).toEqual({ owner: 'Owner', repo: 'Repo' });
    });
  });

  describe('detectFromGitRemote', () => {
    const originalEnv = process.env;
    let tempDir: string;
    let fs: typeof import('fs/promises');
    let path: typeof import('path');
    let os: typeof import('os');

    beforeEach(async () => {
      vi.resetModules();
      process.env = { ...originalEnv };
      fs = await import('fs/promises');
      path = await import('path');
      os = await import('os');
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbom-test-'));
    });

    afterEach(async () => {
      process.env = originalEnv;
      vi.restoreAllMocks();
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('prefers GITHUB_REPOSITORY env var over git remote', async () => {
      process.env.GITHUB_REPOSITORY = 'env-owner/env-repo';
      const config = await GitHubSBOMClient.detectFromGitRemote('/any/path');
      expect(config.owner).toBe('env-owner');
      expect(config.repo).toBe('env-repo');
    });

    it('parses git remote from HTTPS URL in .git/config', async () => {
      delete process.env.GITHUB_REPOSITORY;
      
      // Create a real .git/config file
      const gitDir = path.join(tempDir, '.git');
      await fs.mkdir(gitDir);
      await fs.writeFile(path.join(gitDir, 'config'), `
[core]
  repositoryformatversion = 0
  filemode = true
[remote "origin"]
  url = https://github.com/my-org/my-repo.git
  fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
  remote = origin
`);

      const config = await GitHubSBOMClient.detectFromGitRemote(tempDir);
      expect(config.owner).toBe('my-org');
      expect(config.repo).toBe('my-repo');
    });

    it('parses git remote from SSH URL in .git/config', async () => {
      delete process.env.GITHUB_REPOSITORY;
      
      // Create a real .git/config file
      const gitDir = path.join(tempDir, '.git');
      await fs.mkdir(gitDir);
      await fs.writeFile(path.join(gitDir, 'config'), `
[remote "origin"]
  url = git@github.com:ssh-owner/ssh-repo.git
  fetch = +refs/heads/*:refs/remotes/origin/*
`);

      const config = await GitHubSBOMClient.detectFromGitRemote(tempDir);
      expect(config.owner).toBe('ssh-owner');
      expect(config.repo).toBe('ssh-repo');
    });

    it('returns empty config when .git/config does not exist', async () => {
      delete process.env.GITHUB_REPOSITORY;
      
      const config = await GitHubSBOMClient.detectFromGitRemote(tempDir);
      expect(config.owner).toBeUndefined();
      expect(config.repo).toBeUndefined();
    });

    it('returns empty config when no origin remote found', async () => {
      delete process.env.GITHUB_REPOSITORY;
      
      // Create .git/config without origin remote
      const gitDir = path.join(tempDir, '.git');
      await fs.mkdir(gitDir);
      await fs.writeFile(path.join(gitDir, 'config'), `
[core]
  repositoryformatversion = 0
[remote "upstream"]
  url = https://github.com/other/repo.git
`);

      const config = await GitHubSBOMClient.detectFromGitRemote(tempDir);
      expect(config.owner).toBeUndefined();
      expect(config.repo).toBeUndefined();
    });

    it('inherits token from environment', async () => {
      delete process.env.GITHUB_REPOSITORY;
      process.env.GITHUB_TOKEN = 'ghp_testtoken';
      
      const config = await GitHubSBOMClient.detectFromGitRemote(tempDir);
      expect(config.token).toBe('ghp_testtoken');
    });
  });
});
