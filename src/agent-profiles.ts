/**
 * Agent Profiles - Configuration for Claude and Copilot
 */

import { AgentProfile, AgentId } from './types.js';

export const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    projectSkillPaths: ['.claude/skills', '.github/skills'],
    personalSkillPath: '~/.claude/skills',
    instructionsFile: 'CLAUDE.md',
    customInstructionsPath: '.claude/settings.json'
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    projectSkillPaths: ['.github/skills', '.claude/skills'],
    personalSkillPath: '~/.copilot/skills',
    instructionsFile: 'COPILOT.md',
    customInstructionsPath: '.github/copilot-instructions.md'
  },
  generic: {
    id: 'generic',
    name: 'AI Agent',
    projectSkillPaths: ['.github/skills'],
    personalSkillPath: '~/.agent-skills',
    instructionsFile: 'AGENT.md',
    customInstructionsPath: '.github/agent-instructions.md'
  }
};

export function getAgentProfile(id: AgentId): AgentProfile {
  return AGENT_PROFILES[id] || AGENT_PROFILES.generic;
}
