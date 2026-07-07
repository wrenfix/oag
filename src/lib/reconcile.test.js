'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { reconcile, computeDesiredIds } = require('./reconcile');
const { migrateState, deriveInstalledAssetIds } = require('./state');

test('computeDesiredIds unions manual and plugin assets, dropping hook', () => {
  const desired = computeDesiredIds({
    manual: ['skill/a', 'hook/legacy'],
    plugins: {
      p1: { assets: ['mcp/b', 'skill/a'] },
      p2: { assets: ['agent/c'] },
    },
  });
  assert.deepEqual([...desired].sort(), ['agent/c', 'mcp/b', 'skill/a']);
});

test('migrateState seeds manual from installed assets for old-format state', () => {
  const migrated = migrateState({
    tools: {
      claude: { items: { 'skill/a': {}, 'hook/legacy': {} } },
      codex: { items: { 'mcp/b': {} } },
    },
  });
  assert.deepEqual(migrated.manual, ['mcp/b', 'skill/a']); // hook excluded, sorted
  assert.deepEqual(migrated.plugins, {});
});

test('migrateState does not reseed once in new format', () => {
  const migrated = migrateState({
    plugins: { p: { assets: ['skill/a'] } },
    tools: { claude: { items: { 'skill/z': {} } } },
  });
  assert.deepEqual(migrated.manual, []); // presence of plugins signals new format
});

test('deriveInstalledAssetIds dedupes across tools and excludes hook', () => {
  const ids = deriveInstalledAssetIds({
    claude: { items: { 'skill/a': {}, 'mcp/b': {} } },
    codex: { items: { 'skill/a': {}, 'hook/x': {} } },
  });
  assert.deepEqual(ids, ['mcp/b', 'skill/a']);
});

test('reconcile installs, keeps shared assets, and removes orphaned ones', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'oag-reconcile-'));
  try {
    const assetDir = path.join(tmp, 'registry', 'skills', 'x');
    await fsp.mkdir(assetDir, { recursive: true });
    await fsp.writeFile(path.join(assetDir, 'SKILL.md'), '# x\n', 'utf8');

    const asset = {
      id: 'skill/x',
      name: 'x',
      type: 'skill',
      tools: null,
      files: [{ source: 'SKILL.md' }],
      dir: assetDir,
    };
    const assets = [asset];
    const config = { tools: { claude: { paths: { skill: '.claude/skills/' } } } };
    const projectRoot = path.join(tmp, 'project');
    await fsp.mkdir(projectRoot, { recursive: true });
    const installed = path.join(projectRoot, '.claude', 'skills', 'x', 'SKILL.md');

    const run = (state) => reconcile({ projectRoot, config, assets, commit: 'c', mode: 'copy', state });

    // Plugin A enables skill/x.
    const state = { manual: [], plugins: { A: { assets: ['skill/x'], commit: 'c' } }, tools: {} };
    await run(state);
    assert.ok(fs.existsSync(installed), 'installed by plugin A');
    assert.ok(state.tools.claude.items['skill/x'], 'recorded in state');

    // Also manually selected -> still present, reconcile is idempotent.
    state.manual = ['skill/x'];
    await run(state);
    assert.ok(fs.existsSync(installed), 'still present when shared');

    // Remove plugin A: manual still requires it -> kept (reference retained).
    delete state.plugins.A;
    await run(state);
    assert.ok(fs.existsSync(installed), 'kept because manual still requires it');

    // Drop the last source -> uninstalled.
    state.manual = [];
    await run(state);
    assert.ok(!fs.existsSync(installed), 'removed when no source requires it');
    assert.deepEqual(state.tools.claude.items, {}, 'state cleared');
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test('reconcile does not abort or lose state when an uninstall fails', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'oag-reconcile-fail-'));
  try {
    const projectRoot = path.join(tmp, 'project');
    // A target that is actually a directory -> removeTargets refuses and throws.
    const badTarget = path.join(projectRoot, '.claude', 'skills', 'y');
    await fsp.mkdir(badTarget, { recursive: true });

    const config = { tools: { claude: { paths: { skill: '.claude/skills/' } } } };
    // skill/y is installed but no longer desired (and absent from the registry).
    const state = {
      manual: [],
      plugins: {},
      tools: { claude: { items: { 'skill/y': { targets: [badTarget], mode: 'copy', commit: 'c' } } } },
    };

    const summary = await reconcile({ projectRoot, config, assets: [], commit: 'c', mode: 'copy', state });

    // The run completes, the failure is recorded, and the item is retained so
    // state.json stays consistent with what is still on disk.
    assert.equal(summary.tools.claude.failed.length, 1);
    assert.equal(summary.tools.claude.failed[0].id, 'skill/y');
    assert.ok(state.tools.claude.items['skill/y'], 'item kept after failed uninstall');
    assert.ok(fs.existsSync(path.join(projectRoot, '.oag', 'state.json')), 'state persisted');
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test('reconcile preserves a still-desired asset missing from the registry', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'oag-reconcile-missing-'));
  try {
    const projectRoot = path.join(tmp, 'project');
    const target = path.join(projectRoot, '.claude', 'skills', 'gone', 'SKILL.md');
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, '# gone\n', 'utf8');

    const config = { tools: { claude: { paths: { skill: '.claude/skills/' } } } };
    // skill/gone is still wanted (manual) but not present in the registry.
    const state = {
      manual: ['skill/gone'],
      plugins: {},
      tools: { claude: { items: { 'skill/gone': { targets: [target], mode: 'copy', commit: 'c', baseDir: path.dirname(target) } } } },
    };

    await reconcile({ projectRoot, config, assets: [], commit: 'c', mode: 'copy', state });

    assert.ok(fs.existsSync(target), 'registry-missing but still-desired asset is left in place');
    assert.ok(state.tools.claude.items['skill/gone'], 'item preserved in state');
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});
