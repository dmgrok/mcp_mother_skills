# Mother MCP Roadmap

> **The npm for AI Skills** — Building a community-driven skill ecosystem

Last updated: 2026-01-23

## Quality Signals

Metadata that helps users discover and trust skills.

| Feature | Description | Status |
|---------|-------------|--------|
| 📊 **Download counts** | Install count displayed in search/recommendations | ✅ Done |
| ⭐ **GitHub stars** | Stars passthrough from source repository | ✅ Done |
| ✓ **Verified publishers** | Trust badges with `publisher.verified` field | ✅ Done |
| 🏷️ **Compatibility matrix** | Shows which agents support the skill (Claude, Copilot, Codex, v0) | ✅ Done |
| 📦 **Publisher info** | Publisher name, URL, and verification status | ✅ Done |
| 💬 **Reviews & use cases** | Community feedback like "Worked great for React 19" | 🔮 Planned |
| 👍 **Skill ratings** | Community upvotes/downvotes on skill quality | 🔮 Planned |

## Registry & Distribution

Core infrastructure for skill discovery and installation.

| Feature | Description | Status |
|---------|-------------|--------|
| 🌐 **Public registry** | CDN-hosted catalog at jsdelivr | ✅ Done |
| 🔧 **Custom registries** | Configurable registry URLs (BYOR) | ✅ Done |
| 🔄 **Auto-sync** | Detect tech stack and install matching skills | ✅ Done |
| 📥 **Manual install** | `install_skill` tool for explicit installs | ✅ Done |
| 🗑️ **Reset skills** | Clean slate with `reset_skills` tool | ✅ Done |
| 📤 **`mother publish`** | CLI to publish skills to the registry | 🔮 Planned |
| 🔍 **Semantic search** | Search skills by description/use case | 🔮 Planned |

## Agent Support

Multi-agent compatibility for different AI coding tools.

| Agent | Project Skills | Personal Skills | Status |
|-------|---------------|-----------------|--------|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | ✅ Done |
| GitHub Copilot | `.github/skills/` | `~/.copilot/skills/` | ✅ Done |
| OpenAI Codex | `.codex/skills/` | `~/.codex/skills/` | ✅ Done |
| Vercel v0 | — | — | 🔮 Planned |

## Tech Stack Detection

How Mother MCP identifies your project's technologies.

| Detection Method | Description | Status |
|-----------------|-------------|--------|
| 🏷️ **GitHub SBOM** | Software Bill of Materials via GitHub API | ✅ Done |
| 📦 **Package files** | package.json, requirements.txt, Cargo.toml, etc. | ✅ Done |
| ⚙️ **Config files** | tsconfig.json, Dockerfile, next.config.js, etc. | ✅ Done |
| 📄 **README parsing** | Extract tech mentions from README.md | ✅ Done |
| 🔬 **Specfy analyzer** | 700+ technology detection | ✅ Done |

## Contribution Tools

Making it easy to create and share skills.

| Feature | Description | Status |
|---------|-------------|--------|
| � **Skill bundles** | Curated collections by use case (Full-Stack Next.js, Python API, etc.) | ✅ Done |
| 📦 **Skill templates** | Starter templates for common skill types | 🔮 Planned |
| 🔀 **Fork & customize** | Base your skill on existing ones | 🔮 Planned |
| 📝 **Skill creator tool** | Interactive skill authoring | 🔮 Planned |
| ✅ **Validation** | Lint and validate SKILL.md format | 🔮 Planned |

## Enterprise Features

For organizations that need more control.

| Feature | Description | Status |
|---------|-------------|--------|
| 🔒 **Private registries** | Self-hosted skill catalogs | ✅ Done (BYOR) |
| 🏢 **Auth support** | Registry authentication config | 🔮 Planned |
| 📊 **Usage analytics** | Track skill adoption across teams | 🔮 Planned |
| 🔐 **Skill signing** | Cryptographic verification of skills | 🔮 Planned |

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ Done | Implemented and available |
| 🚧 In Progress | Currently being developed |
| 🔮 Planned | On the roadmap, not yet started |

## Contributing

Have ideas for the roadmap? 

- **Feature requests**: [Open an issue](https://github.com/dmgrok/mcp_mother_skills/issues)
- **Contribute skills**: [agent_skills_directory](https://github.com/dmgrok/agent_skills_directory)
- **Discuss**: Share your use cases and what skills would help your workflow
