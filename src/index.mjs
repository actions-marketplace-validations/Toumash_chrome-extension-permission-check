#!/usr/bin/env node

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

import { readFile, appendFile } from 'fs/promises';
import { compareManifests, buildSummaryMarkdown } from './check.mjs';

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
