'use strict';

const path = require('path');
const { loadConfig, resolveRegistryPath } = require('../lib/config');
const { ensureRemote } = require('../lib/remoteEnsure');
const { ensureRegistrySynced } = require('../lib/registrySync');
const { loadAssets } = require('../lib/registry');

/**
 * Load config, ensure a remote, sync the registry, and resolve the project
 * root. Everything a command needs before touching assets.
 */
async function syncRegistry(options) {
  const config = await loadConfig();
  const remote = await ensureRemote(config);
  const registryRoot = resolveRegistryPath(config);
  const { repoPath } = await ensureRegistrySynced({ registryRoot, remote });
  const projectRoot = path.resolve(options.project || process.cwd());
  return { config, repoPath, projectRoot };
}

/** `syncRegistry` plus the loaded asset list. */
async function prepare(options) {
  const ctx = await syncRegistry(options);
  const assets = await loadAssets(ctx.repoPath);
  return { ...ctx, assets };
}

function reportFailures(summary) {
  for (const [tool, perTool] of Object.entries(summary.tools || {})) {
    for (const failure of perTool.failed) {
      console.log(`- ${tool}: failed ${failure.id}: ${failure.error}`);
    }
  }
}

/**
 * Report a reconcile as an enabled/disabled delta of the desired union plus
 * any per-tool install failures. `label` prefixes the line (e.g. a plugin name).
 */
function reportReconcile({ label, before, after, summary, config }) {
  const added = [...after].filter((id) => !before.has(id)).length;
  const removed = [...before].filter((id) => !after.has(id)).length;
  const tools = Object.keys(config.tools || {}).length;
  const prefix = label ? `${label}: enabled` : 'Enabled';
  console.log(`${prefix} ${added}, disabled ${removed} (across ${tools} tools).`);
  reportFailures(summary);
}

module.exports = {
  syncRegistry,
  prepare,
  reportReconcile,
  reportFailures,
};
