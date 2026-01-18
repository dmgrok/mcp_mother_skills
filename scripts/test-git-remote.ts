/**
 * Test script to verify git remote detection
 */

import { GitHubSBOMClient } from '../src/github-sbom-client.js';
import { EnhancedProjectDetector } from '../src/enhanced-detector.js';

async function testGitRemoteDetection() {
  console.log('=== Git Remote Detection Test ===\n');

  // Test 1: Direct detection from git remote
  console.log('1. Testing GitHubSBOMClient.detectFromGitRemote():');
  const config = await GitHubSBOMClient.detectFromGitRemote(process.cwd());
  console.log(`   Owner: ${config.owner}`);
  console.log(`   Repo: ${config.repo}`);
  console.log(`   Has token: ${!!config.token}\n`);

  // Test 2: URL parsing
  console.log('2. Testing URL parsing:');
  const testUrls = [
    'https://github.com/owner/repo.git',
    'https://github.com/owner/repo',
    'git@github.com:owner/repo.git',
    'ssh://git@github.com/owner/repo.git',
    'https://gitlab.com/owner/repo.git', // Should return null
  ];

  for (const url of testUrls) {
    const parsed = GitHubSBOMClient.parseGitHubUrl(url);
    console.log(`   ${url}`);
    console.log(`   → ${parsed ? `${parsed.owner}/${parsed.repo}` : 'null (not a GitHub URL)'}\n`);
  }

  // Test 3: Full enhanced detection with auto git detection
  console.log('3. Testing EnhancedProjectDetector with auto git detection:');
  const detector = new EnhancedProjectDetector(process.cwd(), {
    useGitHubSBOM: true,
    useSpecfy: true,
    useLocalFallback: true,
  });

  const result = await detector.detect();
  
  console.log(`   Detection sources: ${result.sources.join(', ')}`);
  console.log(`   Languages: ${result.stack.languages.map(t => t.id).join(', ')}`);
  console.log(`   Frameworks: ${result.stack.frameworks.map(t => t.id).join(', ')}`);
  console.log(`   Tools: ${result.stack.tools.map(t => t.id).join(', ')}`);
  console.log(`   Infrastructure: ${result.stack.infrastructure.map(t => t.id).join(', ')}`);
  
  if (result.packages) {
    console.log(`\n   SBOM Packages (${result.packages.length} total):`);
    result.packages.slice(0, 10).forEach(pkg => {
      console.log(`   - ${pkg.name}@${pkg.version} (${pkg.ecosystem})`);
    });
    if (result.packages.length > 10) {
      console.log(`   ... and ${result.packages.length - 10} more`);
    }
  }
}

testGitRemoteDetection().catch(console.error);
