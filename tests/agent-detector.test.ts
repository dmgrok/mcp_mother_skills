/**
 * Tests for Agent Detector
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentDetector } from '../src/agent-detector.js';
import { MotherConfig } from '../src/types.js';

// Mock fs module
vi.mock('fs/promises');

describe('AgentDetector', () => {
  const mockProjectPath = '/test/project';
  
  beforeEach(() => {
    vi.resetAllMocks();
    // Clear environment variables
    delete process.env.CLAUDE_CODE;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.GITHUB_COPILOT;
    delete process.env.COPILOT_AGENT;
    delete process.env.VSCODE_PID;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectFromEnvironment', () => {
    it('should detect Claude from CLAUDE_CODE env var', async () => {
      process.env.CLAUDE_CODE = '1';
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('environment');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect Claude from CLAUDE_API_KEY env var', async () => {
      process.env.CLAUDE_API_KEY = 'sk-test-key';
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('environment');
    });

    it('should detect Copilot from GITHUB_COPILOT env var', async () => {
      process.env.GITHUB_COPILOT = '1';
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('copilot');
      expect(result.method).toBe('environment');
    });

    it('should detect Copilot from VSCODE_PID + GITHUB_TOKEN', async () => {
      process.env.VSCODE_PID = '12345';
      process.env.GITHUB_TOKEN = 'ghp_test';
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('copilot');
      expect(result.method).toBe('environment');
    });
  });

  describe('detectFromConfig', () => {
    it('should use forced agent from config', async () => {
      const config: Partial<MotherConfig> = {
        agent: {
          mode: 'auto',
          sync_both: false,
          force: 'claude'
        }
      } as MotherConfig;
      
      const detector = new AgentDetector(mockProjectPath, config as MotherConfig);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('config');
      expect(result.confidence).toBe(1.0);
    });

    it('should use forced copilot from config', async () => {
      const config: Partial<MotherConfig> = {
        agent: {
          mode: 'auto',
          sync_both: false,
          force: 'copilot'
        }
      } as MotherConfig;
      
      const detector = new AgentDetector(mockProjectPath, config as MotherConfig);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('copilot');
      expect(result.method).toBe('config');
    });
  });

  describe('detectFromClientInfo', () => {
    it('should detect Claude from MCP client name', async () => {
      const detector = new AgentDetector(mockProjectPath, undefined, 'claude-desktop');
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('client');
      expect(result.confidence).toBe(0.9);
    });

    it('should detect Copilot from MCP client name', async () => {
      const detector = new AgentDetector(mockProjectPath, undefined, 'vscode-copilot');
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('copilot');
      expect(result.method).toBe('client');
    });
  });

  describe('detectFromProjectStructure', () => {
    it('should detect Claude from .claude directory', async () => {
      vi.mocked(fs.access).mockImplementation(async (p) => {
        if (p === path.join(mockProjectPath, '.claude')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('project');
      expect(result.confidence).toBe(0.8);
    });

    it('should detect Claude from CLAUDE.md file', async () => {
      vi.mocked(fs.access).mockImplementation(async (p) => {
        if (p === path.join(mockProjectPath, 'CLAUDE.md')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('project');
    });

    it('should detect Copilot from copilot-instructions.md', async () => {
      vi.mocked(fs.access).mockImplementation(async (p) => {
        if (p === path.join(mockProjectPath, '.github/copilot-instructions.md')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('copilot');
      expect(result.method).toBe('project');
    });
  });

  describe('detectFromHomeDirectory', () => {
    it('should detect Claude from ~/.claude/skills', async () => {
      const homedir = os.homedir();
      
      vi.mocked(fs.access).mockImplementation(async (p) => {
        if (p === path.join(homedir, '.claude/skills')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('home');
      expect(result.confidence).toBe(0.7);
    });

    it('should detect Copilot from ~/.copilot/skills', async () => {
      const homedir = os.homedir();
      
      vi.mocked(fs.access).mockImplementation(async (p) => {
        if (p === path.join(homedir, '.copilot/skills')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('copilot');
      expect(result.method).toBe('home');
    });
  });

  describe('default detection', () => {
    it('should return generic agent when nothing is detected', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      
      const detector = new AgentDetector(mockProjectPath);
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('generic');
      expect(result.method).toBe('default');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('setClientName', () => {
    it('should update client name for detection', async () => {
      const detector = new AgentDetector(mockProjectPath);
      detector.setClientName('claude-code');
      
      const result = await detector.detect();
      
      expect(result.agent.id).toBe('claude');
      expect(result.method).toBe('client');
    });
  });
});
