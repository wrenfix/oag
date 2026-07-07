'use strict';

const fs = require('fs/promises');
const path = require('path');
const { pathExists, isPlainObject } = require('./fs');

const PLUGINS_DIR = 'plugins';
const ASSET_ID_PATTERN = /^[^/\s]+\/[^/\s]+$/;

function normalizeAssetIds({ manifestPath, value }) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid plugin: ${manifestPath} ('assets' must be an array).`);
  }

  const ids = [];
  const seen = new Set();
  for (const raw of value) {
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new Error(`Invalid plugin: ${manifestPath} ('assets' must contain non-empty strings).`);
    }

    const id = raw.trim();
    if (!ASSET_ID_PATTERN.test(id)) {
      throw new Error(`Invalid plugin: ${manifestPath} (invalid asset ID '${id}', expected type/name).`);
    }

    if (!seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
  }

  return ids;
}

async function loadPlugins(registryPath) {
  const pluginsRoot = path.join(registryPath, PLUGINS_DIR);
  if (!(await pathExists(pluginsRoot))) {
    return [];
  }

  const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  const plugins = [];
  const names = new Set();

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      continue;
    }

    const manifestPath = path.join(pluginsRoot, entry.name);
    const raw = await fs.readFile(manifestPath, 'utf8');
    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON in plugin: ${manifestPath}`);
    }

    if (!isPlainObject(manifest)) {
      throw new Error(`Invalid plugin: ${manifestPath} (expected a JSON object).`);
    }

    const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
    if (!name) {
      throw new Error(`Invalid plugin: ${manifestPath} ('name' is required).`);
    }
    if (names.has(name)) {
      throw new Error(`Duplicate plugin name '${name}' in ${pluginsRoot}.`);
    }

    const assets = normalizeAssetIds({ manifestPath, value: manifest.assets });
    if (assets.length === 0) {
      throw new Error(`Invalid plugin: ${manifestPath} ('assets' must define at least one asset).`);
    }

    names.add(name);
    plugins.push({
      name,
      description: typeof manifest.description === 'string' ? manifest.description.trim() : '',
      assets,
      file: manifestPath,
    });
  }

  plugins.sort((a, b) => a.name.localeCompare(b.name));
  return plugins;
}

function getPluginByName(plugins, name) {
  if (!name) {
    return null;
  }
  return plugins.find((plugin) => plugin.name === name) || null;
}

module.exports = {
  loadPlugins,
  getPluginByName,
};
