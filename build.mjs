/**
 * Build script: bundles src/ into a single dist/index.mjs
 * No external dependencies needed — just concatenates the modules.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';

async function build() {
  await mkdir('dist', { recursive: true });

  const permissions = await readFile('src/permissions.mjs', 'utf-8');
  const check = await readFile('src/check.mjs', 'utf-8');
  const index = await readFile('src/index.mjs', 'utf-8');

  // Strip imports and shebangs from each file and combine
  const stripImports = (code) =>
    code
      .split('\n')
      .filter((line) => !line.match(/^\s*import\s+/) && !line.match(/^#!\//))
      .join('\n');

  const bundle = [
    '#!/usr/bin/env node',
    '',
    '// Auto-generated bundle — do not edit directly.',
    '// Source: src/permissions.mjs + src/check.mjs + src/index.mjs',
    '',
    "import { readFile, appendFile } from 'fs/promises';",
    '',
    '// ─── permissions.mjs ─────────────────────────────────────────────',
    stripImports(permissions),
    '',
    '// ─── check.mjs ──────────────────────────────────────────────────',
    stripImports(check),
    '',
    '// ─── index.mjs ──────────────────────────────────────────────────',
    stripImports(index),
  ].join('\n');

  await writeFile('dist/index.mjs', bundle);
  console.log('Built dist/index.mjs');
}

build();
