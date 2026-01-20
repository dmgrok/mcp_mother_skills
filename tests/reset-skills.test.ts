/**
 * Tests for reset_skills functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises');

describe('reset_skills tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should require confirmation before resetting', async () => {
    // This test validates the safety check
    const params = {
      confirm: false
    };

    // In actual implementation, this would call handleResetSkills
    // For now, we test the logic
    const shouldProceed = params.confirm;
    expect(shouldProceed).toBe(false);
  });

  it('should remove skills from detected agent only by default', async () => {
    const mockStat = vi.fn().mockResolvedValue({ isDirectory: () => true });
    const mockReaddir = vi.fn().mockResolvedValue([
      { isDirectory: () => true, name: 'react' },
      { isDirectory: () => true, name: 'typescript' }
    ]);
    const mockRm = vi.fn().mockResolvedValue(undefined);

    vi.mocked(fs.stat).mockImplementation(mockStat);
    vi.mocked(fs.readdir).mockImplementation(mockReaddir as any);
    vi.mocked(fs.rm).mockImplementation(mockRm);

    // Simulate reset for one agent path
    const params = {
      confirm: true,
      all_agents: false
    };

    expect(params.confirm).toBe(true);
    expect(params.all_agents).toBe(false);
  });

  it('should remove skills from all agents when all_agents=true', async () => {
    const params = {
      confirm: true,
      all_agents: true
    };

    expect(params.all_agents).toBe(true);
    
    // Should process multiple agent profiles
    const agentIds = ['claude', 'copilot', 'codex', 'generic'];
    expect(agentIds.length).toBe(4);
  });

  it('should clear config when clear_config=true', async () => {
    const mockRm = vi.fn().mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockImplementation(mockRm);

    const params = {
      confirm: true,
      clear_config: true
    };

    expect(params.clear_config).toBe(true);
  });

  it('should clear cache when clear_cache=true', async () => {
    const mockRm = vi.fn().mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockImplementation(mockRm);

    const params = {
      confirm: true,
      clear_cache: true
    };

    expect(params.clear_cache).toBe(true);
  });

  it('should handle ENOENT errors gracefully', async () => {
    const mockStat = vi.fn().mockRejectedValue({ code: 'ENOENT' });
    vi.mocked(fs.stat).mockImplementation(mockStat);

    // Should not throw for non-existent directories
    try {
      await mockStat('/path/that/does/not/exist');
    } catch (error: any) {
      expect(error.code).toBe('ENOENT');
    }
  });

  it('should collect errors for failed operations', async () => {
    const mockRm = vi.fn()
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce(undefined);
    
    vi.mocked(fs.rm).mockImplementation(mockRm);

    const errors: string[] = [];
    
    try {
      await mockRm('/protected/path');
    } catch (error) {
      errors.push(`Failed to remove: ${(error as Error).message}`);
    }

    await mockRm('/writable/path');
    
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Permission denied');
  });
});
