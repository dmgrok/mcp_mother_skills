# Mother MCP Skills

A Model Context Protocol (MCP) server that dynamically provisions agent skills based on project context. Works with **Claude Code**, **GitHub Copilot**, and **OpenAI Codex**.

**🔍 [Browse Available Skills](https://dmgrok.github.io/mcp_mother_skills/)** - Search and explore the skills catalog

## Supported Agents

| Agent | Status | Detection |
|-------|--------|----------|
| Claude Code | ✅ Full Support | Auto-detected via `CLAUDE_CODE` env var |
| Claude Desktop | ✅ Full Support | Auto-detected via MCP client info |
| GitHub Copilot | ✅ Full Support | Auto-detected via VS Code environment |
| OpenAI Codex | ✅ Full Support | Auto-detected via `CODEX_HOME` env var |
| Other MCP Clients | ✅ Generic Support | Falls back to generic profile |

## What It Does

Mother MCP automatically:

1. **Detects** your project's tech stack by scanning `package.json`, `requirements.txt`, config files, and README
2. **Matches** detected technologies to available skills from trusted registries
3. **Downloads** relevant skills to the appropriate location (`.github/skills`, `.claude/skills`, or `.codex/skills`)
4. **Adapts** to whichever AI agent you're using (Claude, Copilot, or Codex)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-mother-skills.git
cd mcp-mother-skills

# Install dependencies
npm install

# Build
npm run build
```

## Configuration

### Claude Code

Add to your project's `.mcp.json` or global config:

```json
{
  "mcpServers": {
    "mother-skills": {
      "command": "node",
      "args": ["/path/to/mcp-mother-skills/dist/index.js"],
      "env": {
        "MOTHER_PROJECT_PATH": "."
      }
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mother-skills": {
      "command": "node",
      "args": ["/path/to/mcp-mother-skills/dist/index.js"],
      "env": {
        "MOTHER_PROJECT_PATH": "/path/to/your/project"
      }
    }
  }
}
```

### VS Code with Copilot

Add to your VS Code settings or `.vscode/mcp.json`:

```json
{
  "mcp.servers": {
    "mother-skills": {
      "command": "node",
      "args": ["${workspaceFolder}/path/to/mcp-mother-skills/dist/index.js"],
      "env": {
        "MOTHER_PROJECT_PATH": "${workspaceFolder}"
      }
    }
  }
}
```

## Usage

### Sync Skills (Primary Command)

Call `sync_skills` at the start of each conversation:

```
Use sync_skills to ensure I have the right skills for this project
```

This will:
- Detect your project's technologies
- Download matching skills from the registry
- Report what was added/updated/removed

### Other Commands

| Command | Description |
|---------|-------------|
| `get_project_context` | View detected stack and installed skills |
| `get_agent_info` | See which agent is detected (Claude/Copilot/Codex) |
| `search_skills` | Search for available skills |
| `install_skill` | Manually install a skill |
| `uninstall_skill` | Remove a skill |
| `check_updates` | Check for skill updates |
| `set_agent_preference` | Set preferred agent (auto/claude/copilot/codex/both) |
| `redetect` | Re-scan project files |

## Project Configuration

Mother MCP creates a `.mcp/mother/` directory in your project:

```
.mcp/mother/
├── config.yaml           # Mother configuration
├── project-context.yaml  # Detected context (auto-generated)
└── cache/               # Registry cache
```

### config.yaml

```yaml
version: "1.0"

agent:
  mode: auto          # auto, claude, copilot, codex
  sync_both: false    # Install to both .github/skills and .claude/skills

registry:
  - url: "https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json"
    priority: 1

cache:
  refresh_interval_days: 7

skills:
  always_include: []  # Skills to always install
  always_exclude: []  # Skills to never install

sync:
  auto_remove: false  # Remove skills when no longer detected
```

## Skills Registry

Mother MCP fetches skills from the [Agent Skills Directory](https://github.com/dmgrok/agent_skills_directory), an automatically updated catalog aggregating skills from multiple providers:

| Provider | Repository | Skills |
|----------|------------|--------|
| Anthropic | [anthropics/skills](https://github.com/anthropics/skills) | 16 |
| OpenAI | [openai/skills](https://github.com/openai/skills) | 10 |
| GitHub | [github/awesome-copilot](https://github.com/github/awesome-copilot) | 3 |

### Browse Skills

**🔍 [Skills Browser](https://dmgrok.github.io/mcp_mother_skills/)** - Interactive search and exploration of all available skills

### Available Skills

**Documents & Data**: `pdf`, `docx`, `pptx`, `xlsx`, `doc-coauthoring`

**Creative & Design**: `frontend-design`, `canvas-design`, `theme-factory`, `brand-guidelines`, `algorithmic-art`, `web-artifacts-builder`

**Development**: `mcp-builder`, `skill-creator`, `webapp-testing`, `internal-comms`, `create-plan`, `gh-fix-ci`, `gh-address-comments`

**Enterprise**: `linear`, `slack-gif-creator`, `notion-spec-to-implementation`, `notion-meeting-intelligence`, `notion-knowledge-capture`, `notion-research-documentation`

**Infrastructure**: `azure-role-selector`, `snowflake-semanticview`

The catalog is refreshed automatically from the [Agent Skills Directory](https://github.com/dmgrok/agent_skills_directory).

## How Skills Are Matched

Mother MCP detects technologies using:

| Source | What It Detects |
|--------|-----------------|
| `package.json` | npm dependencies (react, next, typescript, etc.) |
| `requirements.txt` | Python packages (fastapi, django, etc.) |
| `pyproject.toml` | Python project dependencies |
| Config files | tsconfig.json → TypeScript, Dockerfile → Docker, etc. |
| README.md | Technology mentions with lower confidence |

## Skill Locations

Skills are installed based on detected agent:

| Agent | Primary Path | Fallback |
|-------|--------------|----------|
| Claude | `.claude/skills/` | `.github/skills/` |
| Copilot | `.github/skills/` | `.claude/skills/` |
| Codex | `.codex/skills/` | `.github/skills/` |
| Both | Both locations | - |

## Agent Detection

Mother MCP auto-detects which agent is using it through multiple methods:

| Priority | Method | Claude | Copilot | Codex |
|----------|--------|--------|---------|-------|
| 1 | Config override | `agent.force: claude` | `agent.force: copilot` | `agent.force: codex` |
| 2 | Environment vars | `CLAUDE_CODE=1` | `GITHUB_COPILOT` | `CODEX_HOME` |
| 3 | MCP client info | Contains "claude" | Contains "copilot"/"vscode" | Contains "codex"/"openai" |
| 4 | Project structure | `.claude/` or `CLAUDE.md` | `.github/copilot-instructions.md` | `.codex/skills/` or `AGENTS.md` |
| 5 | Home directory | `~/.claude/skills/` | `~/.copilot/skills/` | `~/.codex/skills/` |

**Note:** Codex skills follow the [Open Agent Skills Standard](https://agentskills.io/) specification.

## Architecture: Static Instructions vs Dynamic Skills

Mother MCP separates concerns between **static project documentation** and **dynamic skill provisioning**:

| Component | Purpose | Managed By |
|-----------|---------|------------|
| `.github/copilot-instructions.md` | Project-specific AI guidance (Copilot) | Developer (static) |
| `CLAUDE.md` | Claude-specific project instructions | Developer (static) |
| `AGENTS.md` | Codex/OpenAI project instructions | Developer (static) |
| `.mcp/mother/config.yaml` | Mother configuration & preferences | Mother MCP |
| `.mcp/mother/project-context.yaml` | Detected tech stack (auto-generated) | Mother MCP |
| `.github/skills/` or `.claude/skills/` | Auto-installed skill files | Mother MCP |

**Key principle**: Mother MCP never modifies your instruction files. It only manages:
- Its own config in `.mcp/mother/`
- Skill files in the appropriate skills directory

### Recommended Workflow

Add this to your project's `CLAUDE.md` or `.github/copilot-instructions.md`:

```markdown
## Startup

At the start of each conversation, call `sync_skills` to ensure project-relevant skills are loaded.
```

This connects your static instructions to Mother's dynamic skill system.

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Watch mode
npm run watch
```

## License

MIT
