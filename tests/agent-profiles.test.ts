/**
 * Tests for Agent Profiles
 */

import { describe, it, expect } from 'vitest';
import { AGENT_PROFILES, getAgentProfile } from '../src/agent-profiles.js';

describe('Agent Profiles', () => {
  describe('AGENT_PROFILES', () => {
    it('should have Claude profile', () => {
      expect(AGENT_PROFILES.claude).toBeDefined();
      expect(AGENT_PROFILES.claude.id).toBe('claude');
      expect(AGENT_PROFILES.claude.name).toBe('Claude');
    });

    it('should have Copilot profile', () => {
      expect(AGENT_PROFILES.copilot).toBeDefined();
      expect(AGENT_PROFILES.copilot.id).toBe('copilot');
      expect(AGENT_PROFILES.copilot.name).toBe('GitHub Copilot');
    });

    it('should have Generic profile', () => {
      expect(AGENT_PROFILES.generic).toBeDefined();
      expect(AGENT_PROFILES.generic.id).toBe('generic');
      expect(AGENT_PROFILES.generic.name).toBe('AI Agent');
    });

    describe('Claude profile', () => {
      const profile = AGENT_PROFILES.claude;

      it('should have correct skill paths', () => {
        expect(profile.projectSkillPaths).toContain('.claude/skills');
        expect(profile.projectSkillPaths).toContain('.github/skills');
        expect(profile.personalSkillPath).toBe('~/.claude/skills');
      });

      it('should have correct instructions file', () => {
        expect(profile.instructionsFile).toBe('CLAUDE.md');
      });

      it('should have correct custom instructions path', () => {
        expect(profile.customInstructionsPath).toBe('.claude/settings.json');
      });
    });

    describe('Copilot profile', () => {
      const profile = AGENT_PROFILES.copilot;

      it('should have correct skill paths', () => {
        expect(profile.projectSkillPaths).toContain('.github/skills');
        expect(profile.projectSkillPaths).toContain('.claude/skills');
        expect(profile.personalSkillPath).toBe('~/.copilot/skills');
      });

      it('should have correct instructions file', () => {
        expect(profile.instructionsFile).toBe('COPILOT.md');
      });

      it('should have correct custom instructions path', () => {
        expect(profile.customInstructionsPath).toBe('.github/copilot-instructions.md');
      });
    });

    describe('Generic profile', () => {
      const profile = AGENT_PROFILES.generic;

      it('should have fallback skill paths', () => {
        expect(profile.projectSkillPaths).toContain('.github/skills');
        expect(profile.personalSkillPath).toBe('~/.agent-skills');
      });

      it('should have generic instructions file', () => {
        expect(profile.instructionsFile).toBe('AGENT.md');
      });
    });
  });

  describe('getAgentProfile', () => {
    it('should return Claude profile for claude id', () => {
      const profile = getAgentProfile('claude');
      expect(profile.id).toBe('claude');
    });

    it('should return Copilot profile for copilot id', () => {
      const profile = getAgentProfile('copilot');
      expect(profile.id).toBe('copilot');
    });

    it('should return Generic profile for generic id', () => {
      const profile = getAgentProfile('generic');
      expect(profile.id).toBe('generic');
    });

    it('should return Generic profile for unknown id', () => {
      // @ts-expect-error - Testing invalid input
      const profile = getAgentProfile('unknown');
      expect(profile.id).toBe('generic');
    });
  });

  describe('Profile priority', () => {
    it('Claude should prioritize .claude/skills over .github/skills', () => {
      const profile = AGENT_PROFILES.claude;
      expect(profile.projectSkillPaths[0]).toBe('.claude/skills');
    });

    it('Copilot should prioritize .github/skills over .claude/skills', () => {
      const profile = AGENT_PROFILES.copilot;
      expect(profile.projectSkillPaths[0]).toBe('.github/skills');
    });
  });
});
