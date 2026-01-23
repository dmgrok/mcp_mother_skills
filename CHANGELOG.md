# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Community quality signals** - Registry catalog now supports metadata for skill discovery
  - `downloads`: Install count (updated by registry maintainer)
  - `stars`: GitHub stars passthrough from source repository
  - `verified`: Publisher verification badge
  - `publisher`: Publisher info with name, URL, and verification status
  - `compatibility`: Agent compatibility matrix (Claude, Copilot, Codex, v0)
  - `repository`: Source repository URL for linking
- Quality signals displayed in `setup` recommendations with badges (✓, ⭐, 📦)
- Quality signals included in `search_skills` results
- New `SkillPublisher` and `SkillCompatibility` TypeScript interfaces
- Documentation for registry catalog format with community fields

### Changed
- `RegistrySkill` interface extended with optional community fields
- Updated example registry.yaml with sample community metadata

## [0.2.1] - 2026-01-23

### Added
- **Claude Code marketplace distribution** - Plugin can now be installed via Claude Code's plugin marketplace
  - Added `.claude-plugin/plugin.json` manifest with MCP server configuration
  - Added `.claude-plugin/marketplace.json` catalog for marketplace hosting
  - Users can install with `/plugin marketplace add dmgrok/mcp_mother_skills`

## [0.2.0] - 2026-01-20

### Added
- **`reset_skills` tool** - Start fresh by removing all installed skills
  - Safely removes all installed skills with required `confirm=true` parameter
  - `all_agents` option to reset skills for all agents (Claude, Copilot, Codex)
  - `clear_config` option to remove Mother configuration files (`.mcp/mother/`)
  - `clear_cache` option to clear the skill registry cache
  - Handles errors gracefully (e.g., missing directories)
  - Returns detailed summary of removed skills and cleared paths
  - Provides next steps guidance after reset
- npm package configuration for public registry deployment
- `.npmignore` file to exclude development files from published package
- `prepublishOnly` script for automated pre-publish validation
- `PUBLISHING.md` guide with step-by-step deployment instructions
- MIT `LICENSE` file
- TypeScript type definitions export (`types` field in package.json)
- **GitHub Actions workflow for automated npm publishing on release**
- Workflow triggers on GitHub release publication
- Automated testing, building, and publishing pipeline
- npm provenance attestation for package integrity

### Changed
- Updated installation instructions to use `npm install` and `npx`
- Configuration examples now use `npx mcp-mother-skills` instead of local paths
- Enhanced package.json with repository, homepage, bugs URLs
- Expanded keywords for better npm discoverability
- Updated PUBLISHING.md with automated and manual publishing workflows
- Added comprehensive documentation for `reset_skills` in README

## [0.1.1] - 2026-01-18

### Added

#### New `setup` Tool - First-Time Onboarding
- **Start here!** New `setup` tool for first-time Mother MCP initialization
- Provides a complete onboarding experience:
  - Scans project to detect technologies (languages, frameworks, databases, tools)
  - Fetches skill registry with force refresh to ensure latest data
  - Finds matching skills based on detected stack with confidence scoring
  - Shows recommendations grouped by match quality (High/Good/Possible)
  - Optional `auto_install` parameter to install all recommended skills automatically
- Responds to natural language like "setup my mother mcp", "initialize", "get started"
- Outputs a formatted summary with:
  - Project info and detected tech stack
  - Agent detection and skill path
  - Registry info (total available skills)
  - Already installed skills
  - Skill recommendations with match explanations
  - Next steps guidance

### Changed
- Registry format now uses JSON (`catalog.json`) instead of TOON format
- Tool descriptions improved for better AI agent understanding

## [0.1.0] - 2026-01-18

### Added

#### Enhanced Tech Stack Detection
- **Tiered Detection Strategy**: New 3-tier detection system for comprehensive tech stack analysis
  - **Tier 1: GitHub SBOM API** - Most accurate dependency data directly from GitHub's dependency graph
  - **Tier 2: @specfy/stack-analyser** - Detects 700+ technologies including infrastructure, SaaS, and cloud services
  - **Tier 3: Local Detection** - Offline fallback using file scanning (original method)

#### GitHub SBOM Integration
- New `GitHubSBOMClient` class for fetching GitHub's Software Bill of Materials
- Automatic parsing of SPDX-formatted dependency graphs
- PURL (Package URL) parsing for ecosystem detection (npm, pip, cargo, maven, etc.)
- Support for 340+ packages detection from GitHub's dependency graph

#### Git Remote Detection
- **Automatic GitHub repo detection** from local git repositories
- Parses `.git/config` to extract owner and repo from remote URL
- Supports multiple URL formats:
  - HTTPS: `https://github.com/owner/repo.git`
  - SSH: `git@github.com:owner/repo.git`
  - SSH URL: `ssh://git@github.com/owner/repo.git`
- Falls back to `GITHUB_REPOSITORY` environment variable (GitHub Actions)

#### New Modules
- `src/github-sbom-client.ts` - GitHub SBOM API client with PURL parsing
- `src/enhanced-detector.ts` - Tiered detection orchestrator
- `scripts/test-git-remote.ts` - Test script for git remote detection

#### Expanded Package-to-Framework Mapping
- 40+ package-to-framework mappings for accurate skill matching
- Maps packages like `react`, `vue`, `express`, `fastapi` to their respective frameworks
- Includes database ORMs, testing frameworks, build tools, and cloud SDKs

### Changed
- Detection now combines results from all three tiers for comprehensive coverage
- `EnhancedProjectDetector` auto-initializes GitHub client from git remote
- Improved accuracy for monorepo and polyglot project detection

### Technical Details
- Added `@specfy/stack-analyser` dependency (v1.27.x)
- New types: `GitHubConfig`, `SBOMPackage`, `SBOMResult`, `EnhancedDetectionConfig`, `EnhancedDetectionResult`, `DetectionSource`
- 140 tests passing (26 new tests for SBOM and enhanced detection)

## [0.0.2] - 2026-01-15

### Added
- Initial release with basic tech stack detection
- Support for Claude, GitHub Copilot, and OpenAI Codex agents
- Local file scanning for package.json, requirements.txt, config files
- Skill registry integration with caching
- Agent auto-detection system
