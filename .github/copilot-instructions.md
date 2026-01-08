# Mother MCP Skills - AI Coding Instructions

## Startup

At the start of each conversation, call `sync_skills` to ensure project-relevant skills are loaded.

## Project Overview

This is an **MCP (Model Context Protocol) server** that dynamically provisions AI agent skills based on project tech stack detection. It supports both Claude and GitHub Copilot agents.

### Core Architecture

```
index.ts          → MCP server entry, tool definitions, request routing
├── agent-detector.ts    → Detects Claude vs Copilot (env vars, client info, project structure)
├── project-detector.ts  → Scans files to detect tech stack (packages, configs, README)
├── registry-client.ts   → Fetches skills from GitHub registries with caching
├── skill-installer.ts   → Downloads/installs skills to agent-specific paths
├── config-manager.ts    → YAML config handling (.mcp/mother/)
├── agent-profiles.ts    → Agent path configurations (claude → .claude/, copilot → .github/)
└── types.ts             → All shared TypeScript interfaces
```

### Data Flow
1. `sync_skills` tool called → `ProjectDetector` scans for packages/files → matches against `RegistryClient` skills → `SkillInstaller` downloads to `.github/skills` or `.claude/skills`

## Development Commands

```bash
npm run build      # TypeScript compilation to dist/
npm run dev        # Run with tsx (no compile step)
npm test           # Vitest test suite
npm run test:watch # Watch mode for TDD
```

## Key Patterns

### Module System
- **ESM-only** (`"type": "module"` in package.json)
- All imports must use `.js` extension: `import { X } from './types.js'`
- Target: ES2022 with NodeNext module resolution

### Type Definitions
All types live in [src/types.ts](src/types.ts). Key interfaces:
- `AgentId`: `'claude' | 'copilot' | 'codex' | 'generic'`
- `DetectedStack`: `{ languages, frameworks, databases, infrastructure, tools }`
- `RegistrySkill`: Skill metadata with triggers (`packages[]`, `files[]`)
- `SyncResult`: Operation result with `added/updated/removed/unchanged`

### Agent Detection Priority (in `agent-detector.ts`)
1. Explicit config override (`config.agent.force`)
2. Environment variables (`CLAUDE_CODE`, `GITHUB_COPILOT`, `CODEX_HOME`)
3. MCP client info string
4. Project structure (`.claude/`, `.codex/skills/`, `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`)
5. Home directory (`~/.claude/skills`, `~/.copilot/skills`, `~/.codex/skills`)
6. Fallback to `generic`

### Codex Compatibility
Skills follow the [Open Agent Skills Standard](https://agentskills.io/):
- Codex skills stored in `.codex/skills/` per OpenAI spec
- `SKILL.md` frontmatter uses `name` + `description` (required)
- Optional: `scripts/`, `references/`, `assets/` directories

### Skill Matching (in `skill-installer.ts`)
Skills match via triggers defined in registry:
- `packages`: Check against `package.json` dependencies
- `files`: Glob patterns in project root
- `readme_keywords`: Extracted from README.md

### Config Storage
Mother uses `.mcp/mother/` directory:
- `config.yaml`: User preferences (agent mode, registry sources, include/exclude lists)
- `project-context.yaml`: Auto-generated detection results
- `cache/`: Registry response cache

## Testing Conventions

- Tests use **Vitest** with mocked `fs/promises`
- Test files mirror source: `src/foo.ts` → `tests/foo.test.ts`
- Mock external dependencies (filesystem, network) at module level with `vi.mock()`
- Example pattern in [tests/skill-installer.test.ts](tests/skill-installer.test.ts):
```typescript
vi.mock('fs/promises');
const mockConfig: MotherConfig = { ...defaultConfig, skills: { always_include: ['react'] } };
```

## Adding New Tools

1. Add tool definition to `TOOLS` array in [src/index.ts](src/index.ts) with `inputSchema`
2. Create handler function `handleToolName(params: TypedParams)`
3. Add case in `CallToolRequestSchema` switch statement
4. Add param types to [src/types.ts](src/types.ts)

## Skill File Format

Skills use `SKILL.md` with YAML frontmatter (see [examples/skills/example-skill/SKILL.md](examples/skills/example-skill/SKILL.md)):
```yaml
---
name: skill-name
version: "1.0.0"
description: "What this skill does"
dependencies: [other-skill]
---
# Skill instructions in markdown...
```
