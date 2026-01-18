/**
 * GitHub SBOM Client - Fetches dependency information from GitHub's SBOM API
 * 
 * Uses GitHub's dependency graph to get accurate package information
 * including transitive dependencies from lock files.
 */

import { GitHubConfig, SBOMPackage, SBOMResult } from './types.js';

interface GitHubSBOMResponse {
  sbom: {
    SPDXID: string;
    spdxVersion: string;
    creationInfo: {
      created: string;
      creators: string[];
    };
    name: string;
    dataLicense: string;
    documentNamespace: string;
    packages: Array<{
      SPDXID: string;
      name: string;
      versionInfo?: string;
      downloadLocation: string;
      filesAnalyzed: boolean;
      licenseConcluded?: string;
      licenseDeclared?: string;
      copyrightText?: string;
      externalRefs?: Array<{
        referenceCategory: string;
        referenceType: string;
        referenceLocator: string;
      }>;
    }>;
    relationships: Array<{
      relationshipType: string;
      spdxElementId: string;
      relatedSpdxElement: string;
    }>;
  };
}

// Map PURL ecosystems to our internal naming
const PURL_ECOSYSTEM_MAP: Record<string, string> = {
  'npm': 'npm',
  'pypi': 'pip',
  'gem': 'rubygems',
  'cargo': 'cargo',
  'golang': 'go',
  'maven': 'maven',
  'nuget': 'nuget',
  'composer': 'composer',
  'pub': 'pub',
  'swift': 'swift',
  'hex': 'hex',
  'github': 'github-actions',
};

export class GitHubSBOMClient {
  private config: GitHubConfig;
  private baseUrl = 'https://api.github.com';

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  /**
   * Check if we have enough configuration to make API calls
   */
  isConfigured(): boolean {
    return !!(this.config.owner && this.config.repo);
  }

  /**
   * Fetch SBOM from GitHub's dependency graph API
   */
  async fetchSBOM(): Promise<SBOMResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const { owner, repo, token } = this.config;
    const url = `${this.baseUrl}/repos/${owner}/${repo}/dependency-graph/sbom`;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`GitHub SBOM: Repository ${owner}/${repo} not found or dependency graph not enabled`);
          return null;
        }
        if (response.status === 403) {
          console.warn('GitHub SBOM: Rate limited or insufficient permissions');
          return null;
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data: GitHubSBOMResponse = await response.json();
      return this.parseSBOM(data);
    } catch (error) {
      console.error('Failed to fetch GitHub SBOM:', error);
      return null;
    }
  }

  /**
   * Parse SBOM response into our package format
   */
  private parseSBOM(response: GitHubSBOMResponse): SBOMResult {
    const packages: SBOMPackage[] = [];
    const { sbom } = response;

    // Build relationship map to determine direct vs transitive
    const directDeps = new Set<string>();
    const repoSPDXID = sbom.packages.find(p => 
      p.SPDXID === 'SPDXRef-Repository' || p.name.includes('/')
    )?.SPDXID;

    for (const rel of sbom.relationships) {
      if (rel.relationshipType === 'DEPENDS_ON' && rel.spdxElementId === repoSPDXID) {
        directDeps.add(rel.relatedSpdxElement);
      }
    }

    for (const pkg of sbom.packages) {
      // Skip the repository itself
      if (pkg.SPDXID === 'SPDXRef-Repository' || pkg.SPDXID === repoSPDXID) {
        continue;
      }

      const parsed = this.parsePackage(pkg, directDeps.has(pkg.SPDXID));
      if (parsed) {
        packages.push(parsed);
      }
    }

    return {
      packages,
      source: 'github-sbom',
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Parse individual package from SBOM
   */
  private parsePackage(
    pkg: GitHubSBOMResponse['sbom']['packages'][0],
    isDirect: boolean
  ): SBOMPackage | null {
    // Try to extract ecosystem and name from PURL
    const purl = pkg.externalRefs?.find(
      ref => ref.referenceType === 'purl'
    )?.referenceLocator;

    if (purl) {
      const parsed = this.parsePURL(purl);
      if (parsed) {
        return {
          name: parsed.name,
          version: parsed.version || pkg.versionInfo,
          ecosystem: parsed.ecosystem,
          license: pkg.licenseDeclared || pkg.licenseConcluded,
          relationship: isDirect ? 'direct' : 'transitive',
          purl,
        };
      }
    }

    // Fallback: try to parse from name (e.g., "npm:lodash" or "rubygems:rails")
    const colonIndex = pkg.name.indexOf(':');
    if (colonIndex > 0) {
      const ecosystem = pkg.name.substring(0, colonIndex);
      const name = pkg.name.substring(colonIndex + 1);
      return {
        name,
        version: pkg.versionInfo,
        ecosystem: PURL_ECOSYSTEM_MAP[ecosystem] || ecosystem,
        license: pkg.licenseDeclared || pkg.licenseConcluded,
        relationship: isDirect ? 'direct' : 'transitive',
      };
    }

    return null;
  }

  /**
   * Parse a Package URL (PURL) string
   * Format: pkg:ecosystem/namespace/name@version?qualifiers#subpath
   */
  private parsePURL(purl: string): { ecosystem: string; name: string; version?: string } | null {
    // pkg:npm/%40scope/name@1.0.0 or pkg:pypi/requests@2.28.0
    const match = purl.match(/^pkg:([^/]+)\/(.+?)(?:@([^?#]+))?(?:\?|#|$)/);
    if (!match) return null;

    const [, ecosystem, nameEncoded, version] = match;
    const name = decodeURIComponent(nameEncoded);

    return {
      ecosystem: PURL_ECOSYSTEM_MAP[ecosystem] || ecosystem,
      name,
      version,
    };
  }

  /**
   * Try to detect GitHub repo info from git remote or environment
   */
  static detectFromEnvironment(): GitHubConfig {
    const config: GitHubConfig = {};

    // Check for GitHub token in common env vars
    config.token = process.env.GITHUB_TOKEN || 
                   process.env.GH_TOKEN ||
                   process.env.GITHUB_PAT;

    // Check for repo info from GitHub Actions environment
    if (process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
      config.owner = owner;
      config.repo = repo;
    }

    return config;
  }

  /**
   * Detect GitHub repo info from local git repository
   * Parses the git remote URL to extract owner and repo
   */
  static async detectFromGitRemote(projectPath: string): Promise<GitHubConfig> {
    const config: GitHubConfig = {};

    // First check env vars
    config.token = process.env.GITHUB_TOKEN || 
                   process.env.GH_TOKEN ||
                   process.env.GITHUB_PAT;

    // Check for GITHUB_REPOSITORY env var (GitHub Actions)
    if (process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
      config.owner = owner;
      config.repo = repo;
      return config;
    }

    // Try to read git remote from .git/config
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const gitConfigPath = path.join(projectPath, '.git', 'config');
      const gitConfig = await fs.readFile(gitConfigPath, 'utf-8');
      
      // Parse remote URL from git config
      // Looks for: [remote "origin"] ... url = ...
      const remoteMatch = gitConfig.match(/\[remote\s+"origin"\][^\[]*url\s*=\s*(.+)/m);
      if (remoteMatch) {
        const url = remoteMatch[1].trim();
        const parsed = GitHubSBOMClient.parseGitHubUrl(url);
        if (parsed) {
          config.owner = parsed.owner;
          config.repo = parsed.repo;
        }
      }
    } catch {
      // .git/config doesn't exist or can't be read
    }

    return config;
  }

  /**
   * Parse a GitHub URL to extract owner and repo
   * Supports multiple formats:
   * - https://github.com/owner/repo.git
   * - https://github.com/owner/repo
   * - git@github.com:owner/repo.git
   * - ssh://git@github.com/owner/repo.git
   */
  static parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    // HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/i);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    // SSH format: git@github.com:owner/repo.git
    const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/i);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    // SSH URL format: ssh://git@github.com/owner/repo.git
    const sshUrlMatch = url.match(/ssh:\/\/git@github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/i);
    if (sshUrlMatch) {
      return { owner: sshUrlMatch[1], repo: sshUrlMatch[2] };
    }

    return null;
  }
}
