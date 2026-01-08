# Mother MCP Skills

A Model Context Protocol (MCP) server that dynamically provisions agent skills based on project context. Works with both **Claude Code** and **GitHub Copilot**.

## Supported Agents

| Agent | Status | Detection |
|-------|--------|----------|
| Claude Code | ✅ Full Support | Auto-detected via `CLAUDE_CODE` env var |
| Claude Desktop | ✅ Full Support | Auto-detected via MCP client info |
| GitHub Copilot | ✅ Full Support | Auto-detected via VS Code environment |
| Other MCP Clients | ✅ Generic Support | Falls back to generic profile |

## What It Does

Mother MCP automatically:

1. **Detects** your project's tech stack by scanning `package.json`, `requirements.txt`, config files, and README
2. **Matches** detected technologies to available skills from trusted registries
3. **Downloads** relevant skills to the appropriate location (`.github/skills` or `.claude/skills`)
4. **Adapts** to whichever AI agent you're using (Claude or Copilot)

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
| `get_agent_info` | See which agent is detected (Claude/Copilot) |
| `search_skills` | Search for available skills |
| `install_skill` | Manually install a skill |
| `uninstall_skill` | Remove a skill |
| `check_updates` | Check for skill updates |
| `set_agent_preference` | Set preferred agent (auto/claude/copilot/both) |
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
  mode: auto          # auto, claude, copilot
  sync_both: false    # Install to both .github/skills and .claude/skills

registry:
  - url: "https://github.com/anthropics/skills"
    priority: 1

cache:
  refresh_interval_days: 7

skills:
  always_include: []  # Skills to always install
  always_exclude: []  # Skills to never install

sync:
  auto_remove: false  # Remove skills when no longer detected
```

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
| Both | Both locations | - |

## Agent Detection

Mother MCP auto-detects which agent is using it through multiple methods:

| Priority | Method | Claude Code | Claude Desktop | GitHub Copilot |
|----------|--------|-------------|----------------|----------------|
| 1 | Config override | `agent.force: claude` | `agent.force: claude` | `agent.force: copilot` |
| 2 | Environment vars | `CLAUDE_CODE=1` | `CLAUDE_API_KEY` | `GITHUB_COPILOT`, `COPILOT_AGENT` |
| 3 | MCP client info | Client name contains "claude" | Client name contains "claude" | Client name contains "copilot" or "vscode" |
| 4 | Project structure | `.claude/` directory exists | `.claude/` directory exists | `.github/copilot-instructions.md` exists |
| 5 | Home directory | `~/.claude/skills/` exists | `~/.claude/skills/` exists | `~/.copilot/skills/` exists |

**Claude Code** is automatically detected when the `CLAUDE_CODE` environment variable is set (which Claude Code does by default).

## Architecture: Static Instructions vs Dynamic Skills

Mother MCP separates concerns between **static project documentation** and **dynamic skill provisioning**:

| Component | Purpose | Managed By |
|-----------|---------|------------|
| `.github/copilot-instructions.md` | Project-specific AI guidance | Developer (static) |
| `CLAUDE.md` | Claude-specific project instructions | Developer (static) |
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
