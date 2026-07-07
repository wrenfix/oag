'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeNextSources } = require('./install');

const asset = (id) => {
  const [type, name] = id.split('/');
  return { id, name, type, tools: null };
};

const makeAssetsById = (ids) => new Map(ids.map((id) => [id, asset(id)]));

// claude maps skill/mcp/agent; NOT subagent (used to exercise "no compatible tool").
const config = { tools: { claude: { paths: { skill: '.claude/skills/', mcp: '.mcp.json', agent: '.claude/agents/' } } } };

const selState = (byType) => {
  const m = new Map();
  for (const [type, ids] of Object.entries(byType)) {
    m.set(type, new Set(ids));
  }
  return m;
};

test('rebuilds manual and plugins from selections and refreshes plugin commit', () => {
  const assetsById = makeAssetsById(['skill/a', 'skill/b', 'mcp/c']);
  const plugins = [
    { name: 'P1', assets: ['skill/a'] },
    { name: 'P2', assets: ['mcp/c'] },
  ];
  const state = {
    manual: ['skill/b'],
    plugins: { P2: { assets: ['mcp/c'], commit: 'old' } },
    tools: {},
  };

  const next = computeNextSources({
    state,
    selectionState: selState({ skill: ['skill/a'], mcp: [] }),
    pluginSelection: new Set(['P1', 'P2']),
    plugins,
    assetsById,
    config,
    commit: 'new',
  });

  assert.deepEqual(next.manual, ['skill/a']); // skill/b unchecked -> dropped
  assert.deepEqual(next.plugins, {
    P2: { assets: ['mcp/c'], commit: 'new' }, // still selected -> refreshed to head
    P1: { assets: ['skill/a'], commit: 'new' }, // newly selected
  });
});

test('unchecked manageable plugin and manual id are removed', () => {
  const assetsById = makeAssetsById(['skill/a']);
  const plugins = [{ name: 'P1', assets: ['skill/a'] }];
  const state = {
    manual: ['skill/a'],
    plugins: { P1: { assets: ['skill/a'], commit: 'old' } },
    tools: {},
  };

  const next = computeNextSources({
    state,
    selectionState: selState({ skill: [] }),
    pluginSelection: new Set(),
    plugins,
    assetsById,
    config,
    commit: 'new',
  });

  assert.deepEqual(next.manual, []);
  assert.deepEqual(next.plugins, {});
});

test('preserves a manual id missing from the registry', () => {
  const assetsById = makeAssetsById(['skill/a']);
  const state = { manual: ['skill/a', 'skill/gone'], plugins: {}, tools: {} };

  const next = computeNextSources({
    state,
    selectionState: selState({ skill: ['skill/a'] }),
    pluginSelection: new Set(),
    plugins: [],
    assetsById,
    config,
    commit: 'new',
  });

  assert.deepEqual(next.manual, ['skill/a', 'skill/gone']); // gone preserved, sorted
});

test('preserves an enabled plugin missing from the registry without refreshing it', () => {
  const assetsById = makeAssetsById(['skill/a']);
  const plugins = [{ name: 'P1', assets: ['skill/a'] }];
  const state = {
    manual: [],
    plugins: { ghost: { assets: ['skill/x'], commit: 'old' } },
    tools: {},
  };

  const next = computeNextSources({
    state,
    selectionState: selState({ skill: [] }),
    pluginSelection: new Set(), // ghost is not shown, so it cannot be checked
    plugins,
    assetsById,
    config,
    commit: 'new',
  });

  assert.deepEqual(next.plugins, { ghost: { assets: ['skill/x'], commit: 'old' } });
});

test('preserves an enabled plugin whose asset has no compatible tool', () => {
  const assetsById = makeAssetsById(['subagent/x']); // subagent has no path mapping in config
  const plugins = [{ name: 'noTool', assets: ['subagent/x'] }];
  const state = {
    manual: [],
    plugins: { noTool: { assets: ['subagent/x'], commit: 'old' } },
    tools: {},
  };

  const next = computeNextSources({
    state,
    selectionState: new Map(),
    pluginSelection: new Set(), // disabled in UI -> not selectable
    plugins,
    assetsById,
    config,
    commit: 'new',
  });

  assert.deepEqual(next.plugins, { noTool: { assets: ['subagent/x'], commit: 'old' } });
});
