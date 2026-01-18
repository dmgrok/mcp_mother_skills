# Publishing to npm

This guide covers how to publish `mcp-mother-skills` to the npm registry.

## Prerequisites

1. **npm account**: Create one at [npmjs.com](https://www.npmjs.com/signup)
2. **npm CLI authentication**: Run `npm login` in your terminal
3. **Repository access**: Ensure you have push access to the GitHub repository
4. **Clean working directory**: Commit all changes before publishing

## Pre-Publishing Checklist

### For Automated Publishing
- [ ] `NPM_TOKEN` secret configured in GitHub (one-time setup)
- [ ] All tests pass: `npm test`
- [ ] `CHANGELOG.md` updated with version changes
- [ ] `README.md` reflects latest features
- [ ] Git working directory is clean

### For Manual Publishing (Additional)
- [ ] npm CLI authenticated: `npm whoami`
- [ ] Build succeeds: `npm run build`
- [ ] Version number updated in `package.json`

## Publishing Methods

### Method 1: Automated via GitHub Release (Recommended)

See [Automated Publishing](#automated-publishing-github-actions) section below.

### Method 2: Manual Publishing

#### 1. Update Version

Choose the appropriate version bump based on [Semantic Versioning](https://semver.org/):

```bash
# Patch release (bug fixes): 0.0.2 → 0.0.3
npm version patch

# Minor release (new features, backward compatible): 0.0.2 → 0.1.0
npm version minor

# Major release (breaking changes): 0.0.2 → 1.0.0
npm version major
```

This will:
- Update `package.json` version
- Create a git commit
- Create a git tag

#### 2. Update CHANGELOG.md

Document changes for this version:

```markdown
## [0.1.0] - 2026-01-18

### Added
- New feature description

### Changed
- Changed feature description

### Fixed
- Bug fix description
```

Commit the changelog:

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog for v0.1.0"
```

#### 3. Run Pre-Publish Checks

The `prepublishOnly` script will automatically run when you publish, but you can test it manually:

```bash
npm run prepublishOnly
```

This runs:
1. `npm run clean` - Removes old build artifacts
2. `npm run build` - Compiles TypeScript
3. `npm test` - Runs test suite

#### 4. Publish to npm

##### For Public Release

```bash
npm publish --access public
```

#### For Beta/Pre-Release

```bash
# Tag as beta
npm version prerelease --preid=beta
npm publish --tag beta

# Users install with: npm install mcp-mother-skills@beta
```

#### 5. Push to GitHub

Push the version commit and tags:

```bash
git push origin main --follow-tags
```

#### 6. Create GitHub Release

1. Go to https://github.com/dmgrok/mcp_mother_skills/releases
2. Click "Draft a new release"
3. Select the version tag (e.g., `v0.1.0`)
4. Title: `Release v0.1.0`
5. Description: Copy from `CHANGELOG.md`
6. Click "Publish release"

## Automated Publishing (GitHub Actions)

✅ **Already configured!** The workflow is at `.github/workflows/publish.yml`

### How It Works

1. **You create a GitHub release** → workflow triggers automatically
2. **Workflow runs**: checkout → install → test → build → publish
3. **Package published to npm** with provenance attestation
4. **Comment added to release** with npm link

### Setup Steps

#### 1. Generate npm Token

1. Go to https://www.npmjs.com/settings/[username]/tokens
2. Click "Generate New Token" → **"Automation"** type
3. Copy the token (starts with `npm_...`)

#### 2. Add to GitHub Secrets

1. Go to repository: https://github.com/dmgrok/mcp_mother_skills/settings/secrets/actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: Paste your token
5. Click "Add secret"

#### 3. Create Release to Publish

```bash
# Update version locally
npm version patch  # or minor/major

# Push with tags
git push origin main --follow-tags

# Create release on GitHub
# Go to: https://github.com/dmgrok/mcp_mother_skills/releases/new
# - Select the tag (e.g., v0.0.3)
# - Add release notes from CHANGELOG.md
# - Click "Publish release"
```

**That's it!** GitHub Actions will automatically publish to npm.

### Or Use GitHub CLI

```bash
# Bump version and push
npm version patch
git push origin main --follow-tags

# Create release (triggers publish)
gh release create v0.0.3 --title "Release v0.0.3" --notes "$(sed -n '/^## \\[0.0.3\\]/,/^## \\[/p' CHANGELOG.md | head -n -1)"
```

### Monitoring

Check workflow status:
- Actions tab: https://github.com/dmgrok/mcp_mother_skills/actions
- Email notifications on failure
- Release comment shows npm link on success## Verifying the Publication

### Check npm Registry

```bash
# View package info
npm info mcp-mother-skills

# Check latest version
npm view mcp-mother-skills version

# View all versions
npm view mcp-mother-skills versions
```

### Test Installation

```bash
# Test npx
npx mcp-mother-skills@latest

# Test global install
npm install -g mcp-mother-skills@latest
mcp-mother-skills --version
```

### Verify Package Contents

```bash
# Download and inspect the tarball
npm pack
tar -xzf mcp-mother-skills-*.tgz
ls -la package/

# Should contain:
# - dist/
# - examples/
# - README.md
# - LICENSE
# - CHANGELOG.md
# - package.json

# Clean up
rm -rf package mcp-mother-skills-*.tgz
```

## Unpublishing (Emergency Only)

⚠️ **Warning**: Unpublishing is discouraged and has restrictions:

```bash
# Can only unpublish within 72 hours of publication
npm unpublish mcp-mother-skills@0.1.0

# Unpublish entire package (use with extreme caution)
npm unpublish mcp-mother-skills --force
```

**Note**: npm doesn't allow republishing the same version number after unpublishing.

## Deprecating a Version

If you need to discourage use of a specific version:

```bash
npm deprecate mcp-mother-skills@0.1.0 "This version has a critical bug. Please upgrade to 0.1.1"
```

## Automated Publishing (GitHub Actions)

Consider setting up automated publishing on tag push:

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm ci
      - run: npm test
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Then add your npm token to GitHub Secrets:
1. Generate token at https://www.npmjs.com/settings/[username]/tokens
2. Add as `NPM_TOKEN` in repository settings → Secrets and variables → Actions

## Troubleshooting

### "You cannot publish over the previously published versions"

- Bump the version number and try again
- Check current versions: `npm view mcp-mother-skills versions`

### "You do not have permission to publish"

- Verify you're logged in: `npm whoami`
- Check package name isn't taken: `npm view mcp-mother-skills`
- Ensure you're in the right npm organization/scope

### "ENEEDAUTH" Error

- Run `npm login` again
- Verify credentials in `~/.npmrc`

### Build Fails During `prepublishOnly`

- Fix TypeScript errors: `npm run build`
- Fix test failures: `npm test`
- Check `tsconfig.json` configuration

## Best Practices

1. **Always test locally first**: Install from tarball before publishing
2. **Use semantic versioning**: Breaking changes = major, features = minor, fixes = patch
3. **Keep CHANGELOG.md updated**: Users need to know what changed
4. **Tag releases on GitHub**: Makes it easy to find specific versions
5. **Test installation methods**: Both `npm install` and `npx` should work
6. **Monitor download stats**: Check https://www.npmjs.com/package/mcp-mother-skills

## Resources

- [npm Publishing Documentation](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [npm CLI Reference](https://docs.npmjs.com/cli/v10/commands)
