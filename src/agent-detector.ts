/**
 * Agent Detector - Determines which AI agent is using the MCP server
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentProfile, AgentId, MotherConfig } from './types.js';
import { AGENT_PROFILES, getAgentProfile } from './agent-profiles.js';

export interface DetectionResult {
  agent: AgentProfile;
  method: 'config' | 'environment' | 'client' | 'project' | 'home' | 'default';
  confidence: number;
}

export class AgentDetector {
  private projectPath: string;
  private config?: MotherConfig;
  private mcpClientName?: string;

  constructor(projectPath: string, config?: MotherConfig, mcpClientName?: string) {
    this.projectPath = projectPath;
    this.config = config;
    this.mcpClientName = mcpClientName;
  }

  async detect(): Promise<DetectionResult> {
    // 1. Check for explicit override in config
    if (this.config?.agent?.force) {
      const agent = getAgentProfile(this.config.agent.force);
      return { agent, method: 'config', confidence: 1.0 };
    }

    // 2. Check environment variables
    const envAgent = this.detectFromEnvironment();
    if (envAgent) {
      return { agent: getAgentProfile(envAgent), method: 'environment', confidence: 0.95 };
    }

    // 3. Check MCP client info
    const clientAgent = this.detectFromClientInfo();
    if (clientAgent) {
      return { agent: getAgentProfile(clientAgent), method: 'client', confidence: 0.9 };
    }

    // 4. Check existing project structure
    const projectAgent = await this.detectFromProjectStructure();
    if (projectAgent) {
      return { agent: getAgentProfile(projectAgent), method: 'project', confidence: 0.8 };
    }

    // 5. Check home directory structure
    const homeAgent = await this.detectFromHomeDirectory();
    if (homeAgent) {
      return { agent: getAgentProfile(homeAgent), method: 'home', confidence: 0.7 };
    }

    // 6. Default to generic
    return { agent: AGENT_PROFILES.generic, method: 'default', confidence: 0.5 };
  }

  private detectFromEnvironment(): AgentId | null {
    // Claude indicators
    if (process.env.CLAUDE_CODE === '1' || process.env.CLAUDE_CODE === 'true') {
      return 'claude';
    }
    if (process.env.CLAUDE_API_KEY) {
      return 'claude';
    }

    // Copilot indicators
    if (process.env.GITHUB_COPILOT || process.env.COPILOT_AGENT) {
      return 'copilot';
    }

    // VS Code with GitHub token (likely Copilot)
    if (process.env.VSCODE_PID && process.env.GITHUB_TOKEN) {
      return 'copilot';
    }

    // Check for Copilot-specific env vars
    const envKeys = Object.keys(process.env);
    if (envKeys.some(key => key.startsWith('GITHUB_COPILOT'))) {
      return 'copilot';
    }

    // OpenAI Codex indicators
    if (process.env.CODEX_HOME || process.env.OPENAI_CODEX) {
      return 'codex';
    }
    if (envKeys.some(key => key.startsWith('CODEX_'))) {
      return 'codex';
    }

    return null;
  }

  private detectFromClientInfo(): AgentId | null {
    if (!this.mcpClientName) return null;

    const clientName = this.mcpClientName.toLowerCase();

    if (clientName.includes('claude')) return 'claude';
    if (clientName.includes('codex') || clientName.includes('openai')) return 'codex';
    if (clientName.includes('copilot')) return 'copilot';
    if (clientName.includes('vscode') || clientName.includes('vs code')) return 'copilot';

    return null;
  }

  private async detectFromProjectStructure(): Promise<AgentId | null> {
    // Check for Claude-specific directory
    if (await this.pathExists(path.join(this.projectPath, '.claude'))) {
      return 'claude';
    }

    // Check for Claude skills directory
    if (await this.pathExists(path.join(this.projectPath, '.claude/skills'))) {
      return 'claude';
    }

    // Check for CLAUDE.md
    if (await this.pathExists(path.join(this.projectPath, 'CLAUDE.md'))) {
      return 'claude';
    }

    // Check for Codex skills directory
    if (await this.pathExists(path.join(this.projectPath, '.codex/skills'))) {
      return 'codex';
    }

    // Check for AGENTS.md (Codex convention)
    if (await this.pathExists(path.join(this.projectPath, 'AGENTS.md'))) {
      return 'codex';
    }

    // Check for Copilot instructions
    if (await this.pathExists(path.join(this.projectPath, '.github/copilot-instructions.md'))) {
      return 'copilot';
    }

    return null;
  }

  private async detectFromHomeDirectory(): Promise<AgentId | null> {
    const home = os.homedir();

    // Check for Claude personal skills
    if (await this.pathExists(path.join(home, '.claude/skills'))) {
      return 'claude';
    }

    // Check for Codex personal skills
    if (await this.pathExists(path.join(home, '.codex/skills'))) {
      return 'codex';
    }

    // Check for Copilot personal skills
    if (await this.pathExists(path.join(home, '.copilot/skills'))) {
      return 'copilot';
    }

    return null;
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set the MCP client name (called during server initialization)
   */
  setClientName(name: string): void {
    this.mcpClientName = name;
  }
}
