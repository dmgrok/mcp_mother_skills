# Mother MCP Skills

**The npm for AI agent skills.** A Model Context Protocol (MCP) server that automatically provisions the right skills for your project — across Claude Code, GitHub Copilot, OpenAI Codex, and Vercel v0.

> *Just like npm discovers and installs the packages you need, Mother MCP discovers and installs the AI skills your project needs.*

## How It Works

Mother MCP is a **consumer** of the [agent_skills_directory](https://github.com/dmgrok/agent_skills_directory) — the central catalog of AI skills from providers like Anthropic, OpenAI, GitHub, Vercel, and the community.

```
┌─────────────────────────────────────────────────────────────────┐
│                   agent_skills_directory                        │
│  The canonical source of AI skills (112+ skills, 6 providers)   │
│  • GitHub stars, downloads, verification status                 │
│  • Skill metadata, provider info, compatibility                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ fetches catalog
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Mother MCP                               │
│  Consumer & Reporter - detects your stack, installs skills      │
│  • Reads quality signals from registry (not generates them)     │
│  • Downloads skills to .github/skills, .claude/skills, etc.     │
└─────────────────────────────────────────────────────────────────┘
```

**Mother MCP does NOT:**
- Generate download counts or star ratings
- Host or maintain the skill registry
- Track usage analytics

**Mother MCP DOES:**
- Consume the catalog and display skill metadata
- Match skills to your detected tech stack
- Install skills to the right location for your AI agent

## Demo

> **Coming Soon**: Interactive demo showing automatic skill detection and installation in seconds.

## Resources

📄 **[Full Documentation](https://dmgrok.github.io/mcp_mother_skills/)** — Complete setup guide and feature walkthrough  
📊 **[Visual Overview (PDF)](docs/MOTHER-MCP-SKILLS.pdf)** — One-page infographic explaining the architecture  
🎬 **[Video Demo](#)** — Coming soon

## Supported Agents

| Agent | Status | Detection |
|-------|--------|----------|
| Claude Code | ✅ Full Support | Auto-detected via `CLAUDE_CODE` env var |
| Claude Desktop | ✅ Full Support | Auto-detected via MCP client info |
| GitHub Copilot | ✅ Full Support | Auto-detected via VS Code environment |
| OpenAI Codex | ✅ Full Support | Auto-detected via `CODEX_HOME` env var |
| Vercel v0 | ✅ Full Support | Auto-detected via project structure |
| Other MCP Clients | ✅ Generic Support | Falls back to generic profile |

## Why Reusable Skills Matter

> *"If you'll do roughly the same thing 10+ times, encode it as a reusable skill. Under 3 times? Just tell Sonnet."*

### The Problem with "Just Ask the AI"

You *can* ask Claude to help with any task ad-hoc. But for teams and repeated workflows, this approach breaks down:

| Pain Point | What Happens | How Mother Solves It |
|------------|--------------|---------------------|
| **Prompt Tax** | Re-typing similar prompts wastes hours weekly | Skills encode best practices once, reuse forever |
| **Prompt Drift** | Small phrasing changes alter behavior unpredictably | Versioned skills deliver consistent results |
| **Discoverability** | "What was that good prompt you used last month?" | Named skills with descriptions, searchable registry |
| **Onboarding** | New devs spend days configuring AI context | `setup` → perfect context in seconds |
| **House Style** | Everyone crafts prompts differently | Shared skills encode team standards |

### Where Skills Add Real Value

✅ **High-value (use skills)**
- Repeated SDLC steps: PR reviews, security checks, test generation, docs
- Org-specific knowledge: architecture rules, domain models, compliance
- Cross-project utilities: dependency upgrades, migrations, repo analysis

❌ **Low-value (just prompt)**
- Quick throwaway scripts or spikes
- Highly unique one-off tasks

### The Before/After

**Without Mother** (prompt tax every time):
```
Hey Claude, review this PR for security issues. Check for SQL injection, 
XSS, also we use React so watch for dangerouslySetInnerHTML, and our 
team prefers early returns, and don't forget we have a custom auth 
middleware pattern, and...
```

**With Mother** (skill already knows your stack):
```
/review
```

The skill knows your framework, your patterns, your team's standards — because it was installed based on your actual project context.

## What It Does

Mother MCP automatically:

1. **Detects** your project's tech stack using a 3-tier strategy:
   - **GitHub SBOM API** for accurate dependency data (340+ packages)
   - **Specfy analyser** for 700+ technologies including infrastructure & SaaS
   - **Local scanning** as offline fallback
2. **Matches** detected technologies to available skills from trusted registries
3. **Downloads** relevant skills to the appropriate location (`.github/skills`, `.claude/skills`, or `.codex/skills`)
4. **Adapts** to whichever AI agent you're using (Claude, Copilot, or Codex)

## Installation

### Claude Code Plugin (Easiest)

Install via Claude Code's plugin marketplace:

```bash
# Add the marketplace
/plugin marketplace add dmgrok/mcp_mother_skills

# Install the plugin
/plugin install mother-mcp@mother-mcp-marketplace
```

Or install directly from GitHub:
```bash
/plugin install dmgrok/mcp_mother_skills
```

Once installed, the Mother MCP server will be available in Claude Code.

### Quick Install via npm

```bash
# Install globally
npm install -g mcp-mother-skills

# Or use with npx (no install needed)
npx mcp-mother-skills
```

### From Source

```bash
# Clone the repository
git clone https://github.com/dmgrok/mcp-mother-skills.git
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
      "command": "npx",
      "args": ["mcp-mother-skills"],
      "env": {
        "MOTHER_PROJECT_PATH": "."
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "mother-skills": {
      "command": "mcp-mother-skills",
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
      "command": "npx",
      "args": ["mcp-mother-skills"],
      "env": {
        "MOTHER_PROJECT_PATH": "/path/to/your/project"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "mother-skills": {
      "command": "mcp-mother-skills",
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
      "command": "npx",
      "args": ["mcp-mother-skills"],
      "env": {
        "MOTHER_PROJECT_PATH": "${workspaceFolder}"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcp.servers": {
    "mother-skills": {
      "command": "mcp-mother-skills",
      "env": {
        "MOTHER_PROJECT_PATH": "${workspaceFolder}"
      }
    }
  }
}
```

## Usage

### Setup (First-Time Onboarding)

When first using Mother MCP, call `setup` to get started:

```
Setup my Mother MCP
```

This will:
- Scan your project to detect technologies (languages, frameworks, databases, tools)
- Fetch the skill registry and find matching skills
- Show recommended skills with match explanations
- Let you choose which skills to install

### Sync Skills (Ongoing Updates)

Call `sync_skills` at the start of each conversation:

```
Use sync_skills to ensure I have the right skills for this project
```

This will:
- Detect your project's technologies
- Download matching skills from the registry
- Report what was added/updated/removed

### Reset Skills (Start Fresh)

If you need to start over or troubleshoot issues, use `reset_skills`:

```
Reset all my Mother MCP skills with confirm=true
```

**Important**: You must set `confirm=true` to proceed with the reset.

Options:
- `confirm` (required): Set to `true` to confirm the reset action
- `all_agents`: Remove skills for all agents (Claude, Copilot, Codex), not just the detected one
- `clear_config`: Also remove Mother configuration files (`.mcp/mother/`)
- `clear_cache`: Clear the skill registry cache

Examples:
```
# Reset only the current agent's skills
reset_skills with confirm=true

# Reset all agents and clear config
reset_skills with confirm=true, all_agents=true, clear_config=true

# Full reset including cache
reset_skills with confirm=true, all_agents=true, clear_config=true, clear_cache=true
```

This will permanently delete all installed skills. After resetting, run `setup` to reinstall skills.

### Other Commands

| Command | Description |
|---------|-------------|
| `setup` | **Start here!** Initialize Mother MCP and get skill recommendations |
| `sync_skills` | Synchronize skills based on detected technologies |
| `get_project_context` | View detected stack and installed skills |
| `get_agent_info` | See which agent is detected (Claude/Copilot/Codex) |
| `search_skills` | Search for available skills |
| `list_bundles` | **NEW** List curated skill bundles by use case |
| `install_bundle` | **NEW** Install a complete skill bundle at once |
| `install_skill` | Manually install a skill |
| `uninstall_skill` | Remove a skill |
| `check_updates` | Check for skill updates |
| `set_agent_preference` | Set preferred agent (auto/claude/copilot/codex/both) |
| `redetect` | Re-scan project files |
| `reset_skills` | **Reset all skills** - Remove all installed skills and optionally clear config |

### Skill Bundles

Bundles are curated collections of skills for common development use cases. Instead of installing skills one by one, get a complete stack with one command:

```
> list_bundles

📦 Available Bundles:
⚛️  frontend-react      - Modern React development with TypeScript and testing
🚀 fullstack-nextjs    - Complete Next.js stack with database and deployment
🐍 api-python          - FastAPI with async patterns and PostgreSQL
🐳 devops-docker       - Containerization with GitHub Actions deployment
🧪 testing-frontend    - Unit, integration, and E2E testing for web apps
```

```
> install_bundle fullstack-nextjs

🚀 Full-Stack Next.js: 7 installed, 0 already present
   ✅ nextjs, react, typescript, prisma, postgresql, docker, github-actions
```

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
| GitHub | [github/awesome-copilot](https://github.com/github/awesome-copilot) | 26 |
| OpenAI | [openai/skills](https://github.com/openai/skills) | 12 |
| HuggingFace | [huggingface/skills](https://github.com/huggingface/skills) | 8 |
| Vercel | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 3 |
| SkillCreator.ai | [skillcreatorai/Ai-Agent-Skills](https://github.com/skillcreatorai/Ai-Agent-Skills) | 47 |

**Total: 112 skills** across documents, creative, development, data, enterprise, integrations, and other categories.

### Bring Your Own Registry

**Want skills tailored for your organization?** The registry URL is fully configurable. Just point to your own catalog:

```yaml
# .mcp/mother/config.yaml
registry:
  # Use your company's private registry
  - url: "https://skills.yourcompany.com/catalog.json"
    priority: 1
  
  # Optionally keep the public registry as fallback
  - url: "https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json"
    priority: 2
```

This lets you:
- **Curate skills** for your organization's specific tech stack and standards
- **Add proprietary skills** that encode internal knowledge and patterns  
- **Control what skills are available** to your engineering teams
- **Version and audit** skills through your own infrastructure

Your private registry just needs to serve a JSON catalog in the same format as the [public catalog](https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json).

### Registry Catalog Format

The registry catalog supports **community quality signals** - metadata that helps users discover and trust skills:

```yaml
skills:
  - name: react
    path: skills/react
    version: "1.5.0"
    description: "React patterns, hooks, and component architecture"
    triggers:
      packages: ["react", "react-dom"]
    tags: [framework, frontend]
    
    # Community Quality Signals (all optional)
    downloads: 28500           # Install count
    stars: 523                 # GitHub stars
    verified: true             # Publisher verified badge
    publisher:
      name: "Mother Skills Team"
      url: "https://github.com/mother-mcp"
      verified: true
    compatibility:             # Agent compatibility matrix
      claude: true
      copilot: true
      codex: true
      v0: true
    repository: "https://github.com/mother-mcp/skills"
```

| Field | Description |
|-------|-------------|
| `downloads` | Number of installs (updated by registry maintainer) |
| `stars` | GitHub stars passthrough from source repo |
| `verified` | Quick verified badge flag |
| `publisher` | Publisher info with optional verification |
| `compatibility` | Which AI agents this skill works with |
| `repository` | Source repository URL |

These signals are displayed in search results and recommendations to help users choose quality skills.

### Available Skills

**Documents & Data**: `pdf`, `docx`, `pptx`, `xlsx`, `doc-coauthoring`

**Creative & Design**: `frontend-design`, `canvas-design`, `theme-factory`, `brand-guidelines`, `algorithmic-art`, `web-artifacts-builder`

**Development**: `mcp-builder`, `skill-creator`, `webapp-testing`, `internal-comms`, `create-plan`, `gh-fix-ci`, `gh-address-comments`

**Enterprise**: `linear`, `slack-gif-creator`, `notion-spec-to-implementation`, `notion-meeting-intelligence`, `notion-knowledge-capture`, `notion-research-documentation`

**Infrastructure**: `azure-role-selector`, `snowflake-semanticview`

The catalog is refreshed automatically. See [catalog.json](https://cdn.jsdelivr.net/gh/dmgrok/agent_skills_directory@main/catalog.json) for the full list.

## How Skills Are Matched

Mother MCP uses a **tiered detection strategy** for comprehensive tech stack analysis:

### Tier 1: GitHub SBOM API (Most Accurate)
When connected to a GitHub repository, Mother fetches the Software Bill of Materials directly from GitHub's dependency graph:
- Automatic repo detection from local `.git/config` remote URL
- Parses SPDX-formatted dependency data with 340+ packages
- PURL parsing for ecosystem detection (npm, pip, cargo, maven, etc.)
- Requires `GITHUB_TOKEN` environment variable

### Tier 2: Specfy Stack Analyser
Comprehensive detection of 700+ technologies:
- Languages, frameworks, databases, infrastructure
- SaaS tools, cloud services, CI/CD systems
- Works offline with local file analysis

### Tier 3: Local Detection (Fallback)
Traditional file scanning for offline environments:

| Source | What It Detects |
|--------|------------------|
| `package.json` | npm dependencies (react, next, typescript, etc.) |
| `requirements.txt` | Python packages (fastapi, django, etc.) |
| `pyproject.toml` | Python project dependencies |
| Config files | tsconfig.json → TypeScript, Dockerfile → Docker, etc. |
| README.md | Technology mentions with lower confidence |

### Git Remote Auto-Detection
Mother automatically detects your GitHub repository from local git configuration:
```bash
# Supported URL formats:
git@github.com:owner/repo.git      # SSH
https://github.com/owner/repo.git  # HTTPS
ssh://git@github.com/owner/repo    # SSH URL
```

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

## Community & Roadmap

Mother MCP is evolving into a community-driven skill ecosystem — **the npm for AI skills**. Here's what we're building:

### Quality Signals (Coming Soon)

| Feature | Description | Status |
|---------|-------------|--------|
| ⭐ **Skill ratings** | Community upvotes/downvotes on skill quality | Planned |
| 📊 **Download counts** | See how many developers use each skill | Planned |
| ✓ **Verified publishers** | Trust badges for official sources (Anthropic, GitHub, etc.) | Planned |
| 💬 **Reviews & use cases** | "Worked great for React 19 + TypeScript" | Planned |
| 🏷️ **Compatibility matrix** | Works with: Claude ✓, Copilot ✓, Codex ✓ | Planned |

### Contribution Tools (Coming Soon)

| Feature | Description | Status |
|---------|-------------|--------|
| 📤 **`mother publish`** | CLI to publish skills to the registry | Planned |
| 📦 **Skill templates** | Starter templates for common skill types | Planned |
| 🔀 **Fork & customize** | Base your skill on existing ones | Planned |
| 📚 **Skill collections** | Curated bundles ("Enterprise Security Pack") | Planned |

### How You Can Help

1. **Star skills you find useful** — helps surface quality
2. **Report issues** with skills that have outdated advice
3. **Contribute skills** via PR to [agent_skills_directory](https://github.com/dmgrok/agent_skills_directory)
4. **Share your use cases** — what skills would help your workflow?

Join the discussion: [GitHub Issues](https://github.com/dmgrok/mcp_mother_skills/issues)

## License

MIT
