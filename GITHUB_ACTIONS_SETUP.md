# GitHub Actions Automated Publishing - Setup Guide

## ✅ What's Configured

A GitHub Actions workflow (`.github/workflows/publish.yml`) that automatically publishes to npm when you create a GitHub release.

## 🔧 One-Time Setup

### Step 1: Generate npm Automation Token

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click **"Generate New Token"**
3. Select **"Automation"** type (recommended for CI/CD)
4. Give it a name like "GitHub Actions - mcp_mother_skills"
5. Click **"Generate Token"**
6. **Copy the token** (starts with `npm_...`) - you won't see it again!

### Step 2: Add Token to GitHub Secrets

1. Go to https://github.com/dmgrok/mcp_mother_skills/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `NPM_TOKEN`
4. Value: Paste your npm token
5. Click **"Add secret"**

✅ **Setup Complete!** You never need to do this again.

## 🚀 Publishing a New Version

### The Workflow

```bash
# 1. Update version number
npm version patch    # 0.0.2 → 0.0.3
# or
npm version minor    # 0.0.2 → 0.1.0
# or  
npm version major    # 0.0.2 → 1.0.0

# 2. Update CHANGELOG.md with changes
# (Add new section under [Unreleased])

# 3. Commit changelog
git add CHANGELOG.md
git commit -m "docs: update changelog for v0.0.3"

# 4. Push with tags
git push origin main --follow-tags

# 5. Create GitHub Release
# Go to: https://github.com/dmgrok/mcp_mother_skills/releases/new
# - Choose tag: v0.0.3
# - Title: Release v0.0.3
# - Description: Copy from CHANGELOG.md
# - Click "Publish release"
```

**🎉 Done!** GitHub Actions will automatically:
- Install dependencies
- Run tests
- Build the project
- Publish to npm
- Add a comment with the npm link

### Using GitHub CLI (faster)

```bash
# All in one command after version bump & changelog update
npm version patch
git push origin main --follow-tags

gh release create v0.0.3 \
  --title "Release v0.0.3" \
  --notes "$(sed -n '/^## \[0.0.3\]/,/^## \[/p' CHANGELOG.md | head -n -1)"
```

## 🔍 Monitoring

### Check Workflow Status

- **Actions tab**: https://github.com/dmgrok/mcp_mother_skills/actions
- **Email notifications**: You'll get emails on success/failure
- **Release comment**: Workflow adds a comment with the npm package link

### Troubleshooting

If the workflow fails:

1. **Check the Actions tab** for error logs
2. **Common issues**:
   - Tests failing → Fix tests locally first
   - Build errors → Run `npm run build` locally
   - npm token expired → Regenerate and update secret
   - npm token wrong type → Must be "Automation" type

## 📦 What Gets Published

The workflow publishes:
- Compiled code in `dist/`
- Examples and documentation
- `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`

**NOT published** (via `.npmignore`):
- Source code (`src/`)
- Tests
- Development configs
- Git files

## 🔒 Security Features

The workflow includes:
- **Provenance attestation** (`--provenance` flag)
  - Verifiable link between npm package and source code
  - Shows the exact commit that built the package
  - Visible on npm package page

## 📋 Pre-Release Checklist

Before creating a release:

- [ ] All tests pass locally: `npm test`
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] Changes committed and pushed
- [ ] Tag pushed to GitHub

## 🎯 Alternative: Manual Publishing

If you prefer manual control or need to publish without a release:

```bash
npm version patch
git push origin main --follow-tags
npm publish --access public
```

See [PUBLISHING.md](PUBLISHING.md) for full manual publishing guide.
