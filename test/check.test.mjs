import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareManifests,
  buildSummaryMarkdown,
  extractHostFromPattern,
  normalizeHost,
  isHostCoveredBy,
  getEffectiveHosts,
  getContentScriptHosts,
  getHostPermissions,
  getPermissions,
  findNewEffectiveHosts,
  categorizeNewPermissions,
  findNewHostPermissions,
} from '../src/check.mjs';

// ─── extractHostFromPattern ─────────────────────────────────────────

describe('extractHostFromPattern', () => {
  it('extracts host from standard https pattern', () => {
    assert.equal(extractHostFromPattern('https://example.com/*'), 'example.com');
  });

  it('extracts host from wildcard scheme', () => {
    assert.equal(extractHostFromPattern('*://example.com/*'), 'example.com');
  });

  it('extracts wildcard subdomain host', () => {
    assert.equal(extractHostFromPattern('https://*.google.com/*'), '*.google.com');
  });

  it('returns * for <all_urls>', () => {
    assert.equal(extractHostFromPattern('<all_urls>'), '*');
  });

  it('returns null for invalid patterns', () => {
    assert.equal(extractHostFromPattern('not-a-url'), null);
  });

  it('extracts host with port', () => {
    assert.equal(extractHostFromPattern('http://localhost:3000/*'), 'localhost:3000');
  });
});

// ─── normalizeHost ──────────────────────────────────────────────────

describe('normalizeHost', () => {
  it('strips www prefix', () => {
    assert.equal(normalizeHost('www.google.com'), 'google.com');
  });

  it('leaves non-www hosts unchanged', () => {
    assert.equal(normalizeHost('google.com'), 'google.com');
  });

  it('leaves wildcard hosts unchanged', () => {
    assert.equal(normalizeHost('*.google.com'), '*.google.com');
  });
});

// ─── isHostCoveredBy ────────────────────────────────────────────────

describe('isHostCoveredBy', () => {
  it('exact match covers itself', () => {
    assert.equal(isHostCoveredBy('example.com', new Set(['example.com'])), true);
  });

  it('wildcard covers subdomain', () => {
    assert.equal(isHostCoveredBy('mail.google.com', new Set(['*.google.com'])), true);
  });

  it('wildcard covers base domain', () => {
    assert.equal(isHostCoveredBy('google.com', new Set(['*.google.com'])), true);
  });

  it('all_urls covers everything', () => {
    assert.equal(isHostCoveredBy('anything.example.com', new Set(['*'])), true);
  });

  it('subdomain does NOT cover wildcard', () => {
    assert.equal(isHostCoveredBy('*.google.com', new Set(['mail.google.com'])), false);
  });

  it('different domain is not covered', () => {
    assert.equal(isHostCoveredBy('evil.com', new Set(['example.com', '*.google.com'])), false);
  });

  it('www normalization works', () => {
    assert.equal(isHostCoveredBy('www.example.com', new Set(['example.com'])), true);
  });

  it('www normalization works in reverse', () => {
    assert.equal(isHostCoveredBy('example.com', new Set(['www.example.com'])), true);
  });
});

// ─── getContentScriptHosts ──────────────────────────────────────────

describe('getContentScriptHosts', () => {
  it('extracts hosts from content_scripts', () => {
    const manifest = {
      content_scripts: [
        { matches: ['https://a.com/*', 'https://b.com/*'] },
        { matches: ['https://c.com/*'] },
      ],
    };
    const hosts = getContentScriptHosts(manifest);
    assert.deepEqual(hosts, new Set(['https://a.com/*', 'https://b.com/*', 'https://c.com/*']));
  });

  it('returns empty set for no content_scripts', () => {
    assert.deepEqual(getContentScriptHosts({}), new Set());
  });
});

// ─── getEffectiveHosts ──────────────────────────────────────────────

describe('getEffectiveHosts', () => {
  it('combines host_permissions and content_scripts hosts', () => {
    const manifest = {
      host_permissions: ['https://a.com/*'],
      content_scripts: [{ matches: ['https://b.com/*'] }],
    };
    const hosts = getEffectiveHosts(manifest);
    assert.deepEqual(hosts, new Set(['a.com', 'b.com']));
  });

  it('deduplicates overlapping hosts', () => {
    const manifest = {
      host_permissions: ['https://example.com/*'],
      content_scripts: [{ matches: ['https://example.com/*'] }],
    };
    const hosts = getEffectiveHosts(manifest);
    assert.deepEqual(hosts, new Set(['example.com']));
  });
});

// ─── categorizeNewPermissions ───────────────────────────────────────

describe('categorizeNewPermissions', () => {
  it('categorizes tabs as warning', () => {
    const result = categorizeNewPermissions(new Set(['tabs']));
    assert.deepEqual(result.withWarning, ['tabs']);
    assert.deepEqual(result.withoutWarning, []);
  });

  it('categorizes storage as safe', () => {
    const result = categorizeNewPermissions(new Set(['storage']));
    assert.deepEqual(result.withWarning, []);
    assert.deepEqual(result.withoutWarning, ['storage']);
  });

  it('splits mixed permissions correctly', () => {
    const result = categorizeNewPermissions(new Set(['tabs', 'storage', 'history']));
    assert.deepEqual(result.withWarning, ['tabs', 'history']);
    assert.deepEqual(result.withoutWarning, ['storage']);
  });
});

// ─── compareManifests (integration) ─────────────────────────────────

describe('compareManifests', () => {
  const baseline = {
    name: 'Test',
    version: '1.0.0',
    manifest_version: 3,
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://example.com/*', 'https://*.google.com/*'],
    content_scripts: [{ matches: ['https://example.com/*'], js: ['content.js'] }],
  };

  it('identical manifests produce no warnings', () => {
    const result = compareManifests(baseline, baseline);
    assert.equal(result.hasWarnings, false);
    assert.equal(result.withWarning.length, 0);
    assert.equal(result.newHosts.length, 0);
    assert.equal(result.newEffectiveHosts.length, 0);
  });

  it('adding safe permission produces no warnings', () => {
    const updated = {
      ...baseline,
      permissions: [...baseline.permissions, 'alarms'],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, false);
    assert.deepEqual(result.withoutWarning, ['alarms']);
  });

  it('adding tabs permission triggers warning', () => {
    const updated = {
      ...baseline,
      permissions: [...baseline.permissions, 'tabs'],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, true);
    assert.deepEqual(result.withWarning, ['tabs']);
  });

  it('adding new host_permission triggers warning', () => {
    const updated = {
      ...baseline,
      host_permissions: [...baseline.host_permissions, 'https://evil.com/*'],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, true);
    assert.ok(result.newHosts.includes('https://evil.com/*'));
  });

  it('adding subdomain of existing wildcard host is NOT an escalation', () => {
    const updated = {
      ...baseline,
      content_scripts: [
        {
          matches: ['https://example.com/*', 'https://mail.google.com/*'],
          js: ['content.js'],
        },
      ],
    };
    const result = compareManifests(baseline, updated);
    // mail.google.com is covered by *.google.com in host_permissions
    assert.equal(result.hasWarnings, false);
  });

  it('adding new domain in content_scripts triggers warning', () => {
    const updated = {
      ...baseline,
      content_scripts: [
        {
          matches: ['https://example.com/*', 'https://new-domain.com/*'],
          js: ['content.js'],
        },
      ],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, true);
    assert.ok(result.newEffectiveHosts.some((h) => h.host === 'new-domain.com'));
  });

  it('removing permissions does not trigger warnings', () => {
    const updated = {
      ...baseline,
      permissions: ['storage'],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, false);
    assert.ok(result.removedPerms.has('activeTab'));
  });

  it('removing host_permissions tracks removed hosts', () => {
    const updated = {
      ...baseline,
      host_permissions: ['https://example.com/*'],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, false);
    assert.ok(result.removedHosts.includes('https://*.google.com/*'));
  });

  it('detects multiple warning types simultaneously', () => {
    const updated = {
      ...baseline,
      permissions: [...baseline.permissions, 'tabs', 'history'],
      host_permissions: [...baseline.host_permissions, 'https://evil.com/*'],
      content_scripts: [
        {
          matches: ['https://example.com/*', 'https://attacker.com/*'],
          js: ['content.js'],
        },
      ],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, true);
    assert.equal(result.withWarning.length, 2);
    assert.ok(result.newHosts.length > 0);
    assert.ok(result.newEffectiveHosts.length > 0);
  });
});

// ─── buildSummaryMarkdown ───────────────────────────────────────────

describe('buildSummaryMarkdown', () => {
  const baseline = { name: 'Test', version: '1.0.0', permissions: ['storage'] };
  const updated = { name: 'Test', version: '2.0.0', permissions: ['storage', 'tabs'] };

  it('produces warning header when warnings exist', () => {
    const result = compareManifests(baseline, updated);
    const md = buildSummaryMarkdown(baseline, updated, result);
    assert.ok(md.includes('Permission Warning Detected'));
    assert.ok(md.includes('`tabs`'));
  });

  it('produces OK header when no warnings', () => {
    const result = compareManifests(baseline, baseline);
    const md = buildSummaryMarkdown(baseline, baseline, result);
    assert.ok(md.includes('Permission Check OK'));
  });

  it('includes version table', () => {
    const result = compareManifests(baseline, updated);
    const md = buildSummaryMarkdown(baseline, updated, result);
    assert.ok(md.includes('`1.0.0`'));
    assert.ok(md.includes('`2.0.0`'));
  });

  it('includes checklist when warnings present', () => {
    const result = compareManifests(baseline, updated);
    const md = buildSummaryMarkdown(baseline, updated, result);
    assert.ok(md.includes('Before publishing'));
    assert.ok(md.includes('optional_permissions'));
  });
});

// ─── findNewEffectiveHosts ──────────────────────────────────────────

describe('findNewEffectiveHosts', () => {
  it('detects new domain from content_scripts not covered by host_permissions', () => {
    const baseline = {
      host_permissions: ['https://example.com/*'],
      content_scripts: [{ matches: ['https://example.com/*'] }],
    };
    const updated = {
      host_permissions: ['https://example.com/*'],
      content_scripts: [{ matches: ['https://example.com/*', 'https://new.com/*'] }],
    };
    const newHosts = findNewEffectiveHosts(baseline, updated);
    assert.equal(newHosts.length, 1);
    assert.equal(newHosts[0].host, 'new.com');
    assert.equal(newHosts[0].source, 'content_scripts');
  });

  it('does not flag subdomain covered by wildcard', () => {
    const baseline = {
      host_permissions: ['https://*.google.com/*'],
      content_scripts: [],
    };
    const updated = {
      host_permissions: ['https://*.google.com/*'],
      content_scripts: [{ matches: ['https://mail.google.com/*'] }],
    };
    const newHosts = findNewEffectiveHosts(baseline, updated);
    assert.equal(newHosts.length, 0);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles manifest with no permissions field', () => {
    const result = compareManifests({}, {});
    assert.equal(result.hasWarnings, false);
  });

  it('handles manifest with empty arrays', () => {
    const manifest = {
      permissions: [],
      host_permissions: [],
      content_scripts: [],
    };
    const result = compareManifests(manifest, manifest);
    assert.equal(result.hasWarnings, false);
  });

  it('handles <all_urls> in baseline covering new hosts', () => {
    const baseline = {
      host_permissions: ['<all_urls>'],
    };
    const updated = {
      host_permissions: ['<all_urls>'],
      content_scripts: [{ matches: ['https://anything.com/*'] }],
    };
    const newHosts = findNewEffectiveHosts(baseline, updated);
    assert.equal(newHosts.length, 0);
  });

  it('detects escalation from specific host to wildcard', () => {
    const baseline = {
      host_permissions: ['https://mail.google.com/*'],
    };
    const updated = {
      host_permissions: ['https://*.google.com/*'],
    };
    const result = compareManifests(baseline, updated);
    assert.equal(result.hasWarnings, true);
  });
});
