#!/usr/bin/env tsx
/**
 * Test script to verify registry fetching works
 */

import { RegistryClient } from './src/registry-client.js';
import * as os from 'os';
import * as path from 'path';

const testRegistry = {
  url: 'https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json',
  priority: 1
};

const cachePath = path.join(os.tmpdir(), 'mother-test-cache');

async function test() {
  console.log('Testing registry fetch...\n');
  console.log(`Registry URL: ${testRegistry.url}`);
  console.log(`Cache path: ${cachePath}\n`);

  const client = new RegistryClient([testRegistry], cachePath, 7);

  try {
    console.log('Fetching all skills (force refresh)...');
    const skills = await client.getAllSkills(true);
    
    console.log(`\n✅ Success! Found ${skills.length} skills\n`);
    
    if (skills.length > 0) {
      console.log('First 5 skills:');
      skills.slice(0, 5).forEach((skill, i) => {
        console.log(`  ${i + 1}. ${skill.name} - ${skill.description.substring(0, 60)}...`);
      });

      console.log('\n\nTesting getSkill("mcp-builder")...');
      const mcpBuilder = await client.getSkill('mcp-builder');
      
      if (mcpBuilder) {
        console.log('✅ Found mcp-builder:', mcpBuilder);
      } else {
        console.log('❌ mcp-builder not found');
        console.log('\nAvailable skill names:');
        skills.forEach(s => console.log(`  - ${s.name}`));
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

test();
