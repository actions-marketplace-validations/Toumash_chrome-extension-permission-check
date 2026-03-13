#!/usr/bin/env node

// Auto-generated bundle — do not edit directly.
// Source: src/permissions.mjs + src/check.mjs + src/index.mjs

import { readFile, appendFile } from 'fs/promises';

// ─── permissions.mjs ─────────────────────────────────────────────
/**
 * Chrome Extension permissions that trigger a user-facing warning dialog.
 *
 * When an extension update adds any of these permissions, Chrome will:
 * 1. Disable the extension automatically
 * 2. Show the user a dialog asking them to re-approve
 * 3. Keep the extension disabled until the user explicitly accepts
 *
 * Source: https://developer.chrome.com/docs/extensions/reference/permissions-list
 * Last updated: 2025-04-29
 */
export const PERMISSIONS_WITH_WARNINGS = new Map([
  ['accessibilityFeatures.modify', 'Change your accessibility settings'],
  ['accessibilityFeatures.read', 'Read your accessibility settings'],
  ['bookmarks', 'Read and change your bookmarks'],
  ['clipboardRead', 'Read data you copy and paste'],
  ['clipboardWrite', 'Modify data you copy and paste'],
  [
    'contentSettings',
    "Change your settings that control websites' access to features such as cookies, JavaScript, plugins, geolocation, microphone, camera etc.",
  ],
  ['debugger', 'Access the page debugger backend + Read and change all your data on all websites'],
  ['declarativeNetRequest', 'Block content on any page'],
  ['declarativeNetRequestFeedback', 'Read your browsing history'],
  ['desktopCapture', 'Capture content of your screen'],
  ['downloads', 'Manage your downloads'],
  ['downloads.open', 'Manage your downloads'],
  ['downloads.ui', 'Manage your downloads'],
  ['favicon', 'Read the icons of the websites you visit'],
  ['geolocation', 'Detect your physical location'],
  ['history', 'Read and change your browsing history on all signed-in devices'],
  ['identity.email', 'Know your email address'],
  ['management', 'Manage your apps, extensions, and themes'],
  ['nativeMessaging', 'Communicate with cooperating native applications'],
  ['notifications', 'Display notifications'],
  ['pageCapture', 'Read and change all your data on all websites'],
  ['privacy', 'Change your privacy-related settings'],
  ['proxy', 'Read and change all your data on all websites'],
  ['readingList', 'Read and change entries in the reading list'],
  ['sessions', 'Read your browsing history on all your signed-in devices'],
  ['system.storage', 'Identify and eject storage devices'],
  ['tabCapture', 'Read and change all your data on all websites'],
  ['tabGroups', 'View and manage your tab groups'],
  ['tabs', 'Read your browsing history'],
  ['topSites', 'Read a list of your most frequently visited websites'],
  ['ttsEngine', 'Read all text spoken using synthesized speech'],
  ['webAuthenticationProxy', 'Read and change all your data on all websites'],
  ['webNavigation', 'Read your browsing history'],
]);


// ─── check.mjs ──────────────────────────────────────────────────
/**
 * Core logic for comparing two Chrome Extension manifest.json files
 * and detecting permission escalations that would trigger Chrome
 * to disable the extension and prompt the user to re-approve.
 *
 * This module is framework-agnostic — it works with plain manifest objects
 * and returns structured results. The GitHub Action wrapper and CLI
 * handle I/O, exit codes, and markdown output separately.
 */


// ─── Manifest field extractors ──────────────────────────────────────

export function getPermissions(manifest) {
  return new Set(manifest.permissions || []);
}

export function getHostPermissions(manifest) {
  return new Set(manifest.host_permissions || []);
}

/**
 * Extract all host patterns from content_scripts[].matches.
 * These populate Chromium's `scriptable_hosts_` in the PermissionSet.
 */
export function getContentScriptHosts(manifest) {
  const hosts = new Set();
  for (const cs of manifest.content_scripts || []) {
    for (const match of cs.matches || []) {
      hosts.add(match);
    }
  }
  return hosts;
}

// ─── Host pattern utilities ─────────────────────────────────────────

/**
 * Parse a Chrome URL pattern and extract the host part.
 * Patterns: "https://example.com/*", "*://*.google.com/*", "<all_urls>"
 * Returns the host portion (e.g., "example.com" or "*.google.com").
 */
export function extractHostFromPattern(pattern) {
  if (pattern === '<all_urls>') return '*';
  const match = pattern.match(/^[^:]+:\/\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Normalize a host for comparison.
 * Strips leading "www." to match Chrome's registrable domain dedup behavior.
 */
export function normalizeHost(host) {
  return host.replace(/^www\./, '');
}

/**
 * Check if a host is already covered by an existing set of hosts.
 * Implements Chrome's subdomain wildcard matching:
 * - "*.google.com" covers "inbox.google.com", "mail.google.com", etc.
 * - "*" (from <all_urls>) covers everything
 * - Exact match covers itself
 */
export function isHostCoveredBy(newHost, existingHosts) {
  const normalizedNew = normalizeHost(newHost);

  for (const existing of existingHosts) {
    const normalizedExisting = normalizeHost(existing);

    if (normalizedExisting === '*') return true;
    if (normalizedNew === normalizedExisting) return true;

    if (normalizedExisting.startsWith('*.')) {
      const wildcardDomain = normalizedExisting.slice(2);
      if (normalizedNew === wildcardDomain || normalizedNew.endsWith('.' + wildcardDomain)) {
        return true;
      }
    }
  }

  return false;
}

// ─── Comparison logic ───────────────────────────────────────────────

function setDifference(a, b) {
  return new Set([...a].filter((x) => !b.has(x)));
}

/**
 * Compute effective hosts from both host_permissions and content_scripts matches.
 * Mirrors Chromium's PermissionSet::effective_hosts() = union(explicit_hosts, scriptable_hosts).
 */
export function getEffectiveHosts(manifest) {
  const hosts = new Set();
  for (const h of getHostPermissions(manifest)) {
    const host = extractHostFromPattern(h);
    if (host) hosts.add(host);
  }
  for (const h of getContentScriptHosts(manifest)) {
    const host = extractHostFromPattern(h);
    if (host) hosts.add(host);
  }
  return hosts;
}

/**
 * Find new effective host domains not covered by existing hosts.
 * Mirrors Chromium's IsPrivilegeIncrease for host permissions.
 * Returns objects with { host, source } for reporting.
 */
export function findNewEffectiveHosts(baseline, updated) {
  const baseHosts = getEffectiveHosts(baseline);
  const updatedHosts = getEffectiveHosts(updated);

  const newHosts = [];
  for (const host of updatedHosts) {
    if (!isHostCoveredBy(host, baseHosts)) {
      const hostPermHosts = new Set(
        [...getHostPermissions(updated)].map(extractHostFromPattern).filter(Boolean),
      );
      const source = hostPermHosts.has(host) ? 'host_permissions' : 'content_scripts';
      newHosts.push({ host, source });
    }
  }

  return newHosts;
}

/**
 * Categorize new permissions into those that trigger warnings and those that don't.
 */
export function categorizeNewPermissions(newPerms) {
  const withWarning = [];
  const withoutWarning = [];

  for (const perm of newPerms) {
    if (PERMISSIONS_WITH_WARNINGS.has(perm)) {
      withWarning.push(perm);
    } else {
      withoutWarning.push(perm);
    }
  }

  return { withWarning, withoutWarning };
}

/**
 * Find new host_permissions patterns (raw set difference).
 */
export function findNewHostPermissions(baseline, updated) {
  const baseHosts = getHostPermissions(baseline);
  const newHosts = getHostPermissions(updated);
  return [...setDifference(newHosts, baseHosts)];
}

// ─── Main comparison entry point ────────────────────────────────────

/**
 * Compare two manifest.json objects and return a structured result
 * describing all permission changes and whether warnings will be triggered.
 *
 * @param {object} baseline - The current/production manifest.json
 * @param {object} updated  - The new/PR manifest.json
 * @returns {object} Comparison result with all categorized changes
 */
export function compareManifests(baseline, updated) {
  const basePerms = getPermissions(baseline);
  const newPerms = setDifference(getPermissions(updated), basePerms);
  const removedPerms = setDifference(basePerms, getPermissions(updated));
  const { withWarning, withoutWarning } = categorizeNewPermissions(newPerms);

  const newHosts = findNewHostPermissions(baseline, updated);
  const removedHosts = [...setDifference(getHostPermissions(baseline), getHostPermissions(updated))];

  const newEffectiveHosts = findNewEffectiveHosts(baseline, updated);

  const hasWarnings = withWarning.length > 0 || newHosts.length > 0 || newEffectiveHosts.length > 0;

  return {
    withWarning,
    withoutWarning,
    newHosts,
    newEffectiveHosts,
    removedPerms,
    removedHosts,
    hasWarnings,
  };
}

// ─── Markdown summary builder ───────────────────────────────────────

/**
 * Build a GitHub-flavored markdown summary of the permission comparison.
 */
export function buildSummaryMarkdown(baseline, updated, result) {
  const { withWarning, withoutWarning, newHosts, newEffectiveHosts, removedPerms, removedHosts, hasWarnings } = result;
  const lines = [];

  if (hasWarnings) {
    lines.push('# :rotating_light: Chrome Extension — Permission Warning Detected');
    lines.push('');
    lines.push('> **This change will trigger a Chrome permission warning for users.**');
    lines.push('> The extension will be **disabled** until users manually re-approve the new permissions.');
    lines.push('');
  } else {
    lines.push('# :white_check_mark: Chrome Extension — Permission Check OK');
    lines.push('');
    lines.push('> Update is safe. Users will not see a permission re-approval dialog.');
    lines.push('');
  }

  lines.push('| | Version |');
  lines.push('|---|---|');
  lines.push(`| **Baseline** | \`${baseline.version || 'N/A'}\` |`);
  lines.push(`| **Updated** | \`${updated.version || 'N/A'}\` |`);
  lines.push('');

  if (withWarning.length > 0) {
    lines.push('## :no_entry_sign: New permissions with warnings');
    lines.push('');
    lines.push('Chrome will show these warnings and **disable the extension** until the user accepts:');
    lines.push('');
    lines.push('| Permission | Chrome Warning |');
    lines.push('|---|---|');
    for (const p of withWarning) {
      const warning = PERMISSIONS_WITH_WARNINGS.get(p);
      lines.push(`| \`${p}\` | _"${warning}"_ |`);
    }
    lines.push('');
  }

  if (newHosts.length > 0) {
    lines.push('## :no_entry_sign: New host permissions');
    lines.push('');
    lines.push('Each new host triggers a warning _"Read and change your data on \\<host\\>"_:');
    lines.push('');
    for (const h of newHosts) {
      lines.push(`- \`${h}\``);
    }
    lines.push('');
  }

  if (newEffectiveHosts.length > 0) {
    const fromContentScripts = newEffectiveHosts.filter((h) => h.source === 'content_scripts');
    const fromHostPerms = newEffectiveHosts.filter((h) => h.source === 'host_permissions');

    if (fromContentScripts.length > 0) {
      lines.push('## :no_entry_sign: New domains from content_scripts');
      lines.push('');
      lines.push('New `content_scripts[].matches` patterns add access to domains not covered by existing `host_permissions`.');
      lines.push('Chrome treats this as a privilege escalation (scriptable_hosts -> effective_hosts):');
      lines.push('');
      for (const h of fromContentScripts) {
        lines.push(`- \`${h.host}\``);
      }
      lines.push('');
    }

    if (fromHostPerms.length > 0 && newHosts.length === 0) {
      lines.push('## :no_entry_sign: New domains from host_permissions (domain-level analysis)');
      lines.push('');
      for (const h of fromHostPerms) {
        lines.push(`- \`${h.host}\``);
      }
      lines.push('');
    }
  }

  if (hasWarnings) {
    lines.push('## Before publishing');
    lines.push('');
    lines.push('- [ ] Prepare user communication about the need to manually re-approve the extension');
    lines.push('- [ ] Consider using `optional_permissions` instead of required ones');
    lines.push('- [ ] Confirm with the team that this change is necessary');
    lines.push('');
  }

  if (withoutWarning.length > 0) {
    lines.push('<details>');
    lines.push('<summary>New permissions without warnings (safe)</summary>');
    lines.push('');
    for (const p of withoutWarning) {
      lines.push(`- \`${p}\``);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (removedPerms.size > 0 || removedHosts.length > 0) {
    lines.push('<details>');
    lines.push('<summary>Removed permissions</summary>');
    lines.push('');
    for (const p of removedPerms) {
      lines.push(`- \`${p}\` (permission)`);
    }
    for (const h of removedHosts) {
      lines.push(`- \`${h}\` (host)`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (
    !hasWarnings &&
    withoutWarning.length === 0 &&
    removedPerms.size === 0 &&
    newHosts.length === 0 &&
    removedHosts.length === 0 &&
    newEffectiveHosts.length === 0
  ) {
    lines.push('_No permission changes detected._');
    lines.push('');
  }

  lines.push('<details>');
  lines.push('<summary>Full permission listing</summary>');
  lines.push('');
  lines.push('**permissions:**');
  for (const p of updated.permissions || []) {
    lines.push(`- \`${p}\``);
  }
  lines.push('');
  lines.push('**host_permissions:**');
  for (const h of updated.host_permissions || []) {
    lines.push(`- \`${h}\``);
  }
  lines.push('');
  lines.push('**content_scripts hosts (scriptable_hosts):**');
  for (const h of getContentScriptHosts(updated)) {
    lines.push(`- \`${h}\``);
  }
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}


// ─── index.mjs ──────────────────────────────────────────────────

/**
 * Entry point for the GitHub Action and CLI.
 *
 * As a GitHub Action:
 *   Uses INPUT_BASELINE_MANIFEST and INPUT_NEW_MANIFEST env vars (set by actions/core).
 *
 * As a CLI:
 *   node src/index.mjs <baseline-manifest.json> <new-manifest.json>
 *
 * Exit codes:
 *   0 - No new permission warnings (safe update)
 *   1 - New permission warnings detected (extension will be disabled)
 *   2 - Script error (missing files, invalid JSON, etc.)
 */


async function loadManifest(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (e) {
    console.error(`Error reading ${label} manifest (${path}): ${e.message}`);
    process.exit(2);
  }
}

function resolveInputs() {
  // GitHub Action mode: inputs come via environment variables
  const ghBaseline = process.env['INPUT_BASELINE-MANIFEST'];
  const ghNew = process.env['INPUT_NEW-MANIFEST'];
  const ghFailOnWarning = process.env['INPUT_FAIL-ON-WARNING'];

  if (ghBaseline && ghNew) {
    return {
      baselinePath: ghBaseline,
      newPath: ghNew,
      failOnWarning: ghFailOnWarning !== 'false',
    };
  }

  // CLI mode: positional arguments
  const [, , baselinePath, newPath] = process.argv;
  if (!baselinePath || !newPath) {
    console.error('Usage: check-permission-warnings <baseline-manifest.json> <new-manifest.json>');
    console.error('');
    console.error('Compares two Chrome Extension manifest.json files (MV3) and detects');
    console.error('permission escalations that would disable the extension for users.');
    process.exit(2);
  }

  return { baselinePath, newPath, failOnWarning: true };
}

async function main() {
  const { baselinePath, newPath, failOnWarning } = resolveInputs();

  const baseline = await loadManifest(baselinePath, 'baseline');
  const updated = await loadManifest(newPath, 'new');

  const result = compareManifests(baseline, updated);

  // Console output
  console.log('=== Chrome Extension Permission Warning Check ===\n');
  console.log(`Baseline: ${baseline.name || 'unknown'} v${baseline.version || 'N/A'}`);
  console.log(`Updated:  ${updated.name || 'unknown'} v${updated.version || 'N/A'}\n`);

  if (result.withWarning.length > 0) {
    console.log('NEW PERMISSIONS WITH WARNINGS:');
    for (const p of result.withWarning) {
      console.log(`  - ${p}`);
    }
    console.log('');
  }

  if (result.newHosts.length > 0) {
    console.log('NEW HOST PERMISSIONS (all trigger warnings):');
    for (const h of result.newHosts) {
      console.log(`  - ${h}`);
    }
    console.log('');
  }

  if (result.newEffectiveHosts.length > 0) {
    console.log('NEW EFFECTIVE HOSTS (from content_scripts or host_permissions domain analysis):');
    for (const { host, source } of result.newEffectiveHosts) {
      console.log(`  - ${host} (from ${source})`);
    }
    console.log('');
  }

  if (result.withoutWarning.length > 0) {
    console.log('New permissions WITHOUT warnings (safe):');
    for (const p of result.withoutWarning) {
      console.log(`  - ${p}`);
    }
    console.log('');
  }

  if (result.removedPerms.size > 0) {
    console.log('Removed permissions:');
    for (const p of result.removedPerms) {
      console.log(`  - ${p}`);
    }
    console.log('');
  }

  if (result.removedHosts.length > 0) {
    console.log('Removed host permissions:');
    for (const h of result.removedHosts) {
      console.log(`  - ${h}`);
    }
    console.log('');
  }

  if (result.hasWarnings) {
    console.log('RESULT: WARNING DETECTED');
    console.log('This update WILL disable the extension for users until they accept new permissions.');
  } else {
    console.log('RESULT: NO WARNING - safe update');
  }

  // GitHub Actions Job Summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const markdown = buildSummaryMarkdown(baseline, updated, result);
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  // GitHub Actions outputs
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `warning_detected=${result.hasWarnings}\n`);
    if (result.hasWarnings) {
      const allNewItems = [
        ...result.withWarning,
        ...result.newHosts,
        ...result.newEffectiveHosts.map((h) => h.host),
      ];
      await appendFile(process.env.GITHUB_OUTPUT, `new_permissions=${allNewItems.join(', ')}\n`);
    }
  }

  if (result.hasWarnings && failOnWarning) {
    process.exit(1);
  }
}

main();
