'use strict';

const fs = require('fs/promises');
const path = require('path');
const { ensureDir, pathExists, isPlainObject } = require('./fs');

function getStatePath(projectRoot) {
  return path.join(projectRoot, '.oag', 'state.json');
}

function getTypeFromId(id) {
  return String(id || '').split('/')[0];
}

/**
 * Collect every installed asset id across all tools (legacy `hook` excluded).
 * Used to seed the `manual` source when migrating pre-plugins state.
 */
function deriveInstalledAssetIds(tools) {
  const ids = new Set();
  for (const tool of Object.values(tools || {})) {
    const items = tool && isPlainObject(tool.items) ? tool.items : {};
    for (const id of Object.keys(items)) {
      if (getTypeFromId(id) !== 'hook') {
        ids.add(id);
      }
    }
  }
  return [...ids].sort();
}

/**
 * Bring state into the sources model `{ manual, plugins, tools }`. Idempotent.
 * New format is signalled by the presence of `manual` or `plugins`. Old
 * single-tool state seeds `manual` from whatever is already installed so the
 * first reconcile does not tear those assets down. Because `manual` is
 * tool-agnostic, an asset previously installed on only one tool will spread to
 * every compatible tool on the next reconcile.
 */
function migrateState(state) {
  const source = isPlainObject(state) ? state : {};
  const tools = isPlainObject(source.tools) ? source.tools : {};
  const isNewFormat = Array.isArray(source.manual) || isPlainObject(source.plugins);

  const manual = Array.isArray(source.manual)
    ? source.manual
    : (isNewFormat ? [] : deriveInstalledAssetIds(tools));
  const plugins = isPlainObject(source.plugins) ? source.plugins : {};

  return { manual, plugins, tools };
}

async function loadState(projectRoot) {
  const statePath = getStatePath(projectRoot);
  if (!(await pathExists(statePath))) {
    return migrateState({});
  }

  const raw = await fs.readFile(statePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in state: ${statePath}`);
  }

  return migrateState(parsed);
}

async function saveState(projectRoot, state) {
  const statePath = getStatePath(projectRoot);
  await ensureDir(path.dirname(statePath));
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = {
  loadState,
  saveState,
  getStatePath,
  migrateState,
  deriveInstalledAssetIds,
  getTypeFromId,
};
