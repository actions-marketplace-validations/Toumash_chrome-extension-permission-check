# Chrome Extension Permission Check

A GitHub Action that detects Chrome Extension (Manifest V3) permission escalations between two `manifest.json` files. It predicts whether an extension update will be disabled by Chrome and require users to manually re-approve new permissions.

## Why?

When a Chrome extension update adds new permissions that trigger warning dialogs, Chrome will:

1. **Disable** the extension automatically
2. **Show** the user a re-approval dialog
3. **Keep** the extension disabled until the user explicitly accepts

This can cause significant user churn. This action catches these changes in CI before they ship.

## Usage

### Basic — Compare two manifest files

```yaml
- name: Check permission warnings
  uses: Toumash/chrome-extension-permission-check@v1
  with:
    baseline-manifest: path/to/old/manifest.json
    new-manifest: path/to/new/manifest.json
```

### Full example — Compare base branch vs PR

```yaml
name: Extension Permission Check
on:
  pull_request:
    paths:
      - 'extension/manifest.json'
      - 'extension/src/manifest.ts'

jobs:
  check-permissions:
    name: Chrome Extension Permission Warning Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR branch
        uses: actions/checkout@v4
        with:
          path: pr

      - name: Checkout base branch
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.base.sha }}
          path: base

      # Build both manifests (your build step may differ)
      - name: Build baseline manifest
        working-directory: base/extension
        run: npm ci && npm run build

      - name: Build PR manifest
        working-directory: pr/extension
        run: npm ci && npm run build

      - name: Check permission warnings
        uses: Toumash/chrome-extension-permission-check@v1
        with:
          baseline-manifest: base/extension/dist/manifest.json
          new-manifest: pr/extension/dist/manifest.json
```

### Warn without failing

```yaml
- name: Check permission warnings
  uses: Toumash/chrome-extension-permission-check@v1
  with:
    baseline-manifest: old-manifest.json
    new-manifest: new-manifest.json
    fail-on-warning: 'false'
```

### CLI usage (without GitHub Actions)

```bash
npx chrome-extension-permission-check old-manifest.json new-manifest.json
# or
node src/index.mjs old-manifest.json new-manifest.json
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `baseline-manifest` | Yes | — | Path to the baseline (current/production) `manifest.json` |
| `new-manifest` | Yes | — | Path to the new (PR/updated) `manifest.json` |
| `fail-on-warning` | No | `true` | Whether to fail the action when permission warnings are detected |

## Outputs

| Output | Description |
|---|---|
| `warning_detected` | `true` or `false` — whether new permission warnings were detected |
| `new_permissions` | Comma-separated list of new permissions/hosts that trigger warnings |

## What it checks

### 1. Permission warnings

Based on the [Chrome permission warnings list](https://developer.chrome.com/docs/extensions/reference/permissions-list), detects new permissions that trigger user-facing warning dialogs (e.g., `tabs`, `history`, `bookmarks`, `downloads`).

### 2. Host permissions

Detects new `host_permissions` entries that grant access to new domains.

### 3. Content script hosts (effective hosts)

Detects new domains in `content_scripts[].matches` that aren't already covered by existing `host_permissions`. This mirrors Chromium's `PermissionSet::effective_hosts()` comparison in `IsPrivilegeIncrease()`.

### Smart matching

- **Wildcard subdomains**: `*.google.com` covers `mail.google.com` — adding a subdomain of an existing wildcard is NOT an escalation
- **www normalization**: `www.example.com` and `example.com` are treated as the same host
- **Scheme upgrades**: Changing `http` to `https` for the same domain is NOT an escalation
- **Safe permissions**: `storage`, `alarms`, `activeTab`, etc. don't trigger warnings

## Exit codes

| Code | Meaning |
|---|---|
| `0` | No permission warnings — safe update |
| `1` | Permission warnings detected — extension will be disabled for users |
| `2` | Script error (missing files, invalid JSON, etc.) |

## GitHub Actions Summary

When running in GitHub Actions, the action writes a detailed markdown summary to the job summary, including:

- Version comparison table
- List of new permissions with their Chrome warning text
- New host permissions and content script domains
- Pre-publish checklist for dangerous changes
- Full permission listing

## Keeping the permission list up to date

The list of permissions that trigger Chrome warning dialogs is hard-coded in `src/permissions.mjs`, based on the [Chrome permissions list docs](https://developer.chrome.com/docs/extensions/reference/permissions-list) (last synced: **2025-04-29**).

A **weekly scheduled workflow** (`.github/workflows/check-docs-update.yml`) automatically checks if Chrome's documentation has been updated by comparing the `dateModified` field in the page's JSON-LD structured data against the known date. If a change is detected, it opens a GitHub issue with the `permissions-update` label — so maintainers are notified to review and update the permission list.

No duplicate issues are created: the workflow skips issue creation if an open `permissions-update` issue already exists.

## Development

```bash
# Run tests
npm test

# Build dist bundle
npm run build
```

## License

MIT
