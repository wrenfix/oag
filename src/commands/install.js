'use strict';

const inquirer = require('inquirer');
const { loadState } = require('../lib/state');
const { loadPlugins, getPluginByName } = require('../lib/plugins');
const { reconcile, computeDesiredIds, applicableTools, assetAppliesToAnyTool } = require('../lib/reconcile');
const { safeGetHeadCommit } = require('../lib/git');
const { prepare, reportReconcile } = require('./shared');

// Main-menu sentinel for the plugins category. Distinct from any asset type and
// from `null` (which means "Save and exit").
const PLUGINS_KEY = '__plugins__';

function groupAssetsByType(assets) {
  const grouped = new Map();
  for (const asset of assets) {
    if (!grouped.has(asset.type)) {
      grouped.set(asset.type, []);
    }
    grouped.get(asset.type).push(asset);
  }
  return grouped;
}

function initSelectionState(grouped, manualIds) {
  const state = new Map();
  for (const [type, typeAssets] of grouped) {
    const selected = new Set();
    for (const asset of typeAssets) {
      if (manualIds.has(asset.id)) {
        selected.add(asset.id);
      }
    }
    state.set(type, selected);
  }
  return state;
}

function mergeSelections(selectionState) {
  const merged = new Set();
  for (const selected of selectionState.values()) {
    for (const id of selected) {
      merged.add(id);
    }
  }
  return merged;
}

async function showMainMenu(grouped, selectionState, plugins, pluginSelection) {
  const typeChoices = [];
  for (const [type, typeAssets] of grouped) {
    const enabledCount = (selectionState.get(type) || new Set()).size;
    const label = enabledCount > 0
      ? `${type} (${typeAssets.length} total, ${enabledCount} enabled)`
      : `${type} (${typeAssets.length} total)`;
    typeChoices.push({ name: label, value: type });
  }

  typeChoices.sort((a, b) => a.value.localeCompare(b.value));

  const pluginLabel = pluginSelection.size > 0
    ? `plugins (${plugins.length} total, ${pluginSelection.size} enabled)`
    : `plugins (${plugins.length} total)`;
  typeChoices.push({ name: pluginLabel, value: PLUGINS_KEY });

  typeChoices.push(new inquirer.Separator('────────────────────'));
  typeChoices.push({ name: 'Save and exit', value: null });

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'selection',
      message: 'Select asset type to configure',
      choices: typeChoices,
      pageSize: 15,
    },
  ]);

  return answer.selection;
}

function buildChoices(assets, config, currentSelection) {
  const sorted = [...assets].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map((asset) => {
    const tools = applicableTools(asset, config);
    const baseLabel = asset.description ? `${asset.id} - ${asset.description}` : asset.id;

    if (tools.length === 0) {
      return { name: `${baseLabel} (no compatible tool)`, value: asset.id, disabled: 'no compatible tool' };
    }

    return {
      name: `${baseLabel} [${tools.join(', ')}]`,
      value: asset.id,
      checked: currentSelection.has(asset.id),
    };
  });
}

async function selectAssetsForType(type, typeAssets, config, currentSelection) {
  const choices = buildChoices(typeAssets, config, currentSelection);
  if (choices.length === 0) {
    return [];
  }

  const answer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: `Select ${type}s`,
      choices,
      pageSize: 20,
    },
  ]);

  return answer.selected;
}

/**
 * Reasons a plugin cannot be installed as-is: an asset it references is missing
 * from the registry or applies to no configured tool. Empty array => installable.
 */
function pluginInstallErrors(plugin, assetsById, config) {
  const errors = [];
  for (const id of plugin.assets) {
    const asset = assetsById.get(id);
    if (!asset) {
      errors.push(`${id}: not in registry`);
      continue;
    }
    if (!assetAppliesToAnyTool(asset, config)) {
      errors.push(`${id}: no compatible tool`);
    }
  }
  return errors;
}

function buildPluginChoices(plugins, assetsById, config, currentSelection) {
  const sorted = [...plugins].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map((plugin) => {
    const baseLabel = plugin.description
      ? `${plugin.name} - ${plugin.description} (${plugin.assets.length} assets)`
      : `${plugin.name} (${plugin.assets.length} assets)`;

    const errors = pluginInstallErrors(plugin, assetsById, config);
    if (errors.length > 0) {
      return { name: `${baseLabel} (unavailable: ${errors[0]})`, value: plugin.name, disabled: 'unavailable' };
    }

    return {
      name: baseLabel,
      value: plugin.name,
      checked: currentSelection.has(plugin.name),
    };
  });
}

async function selectPlugins(plugins, assetsById, config, currentSelection) {
  const choices = buildPluginChoices(plugins, assetsById, config, currentSelection);
  if (choices.length === 0) {
    return [...currentSelection];
  }

  const answer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select plugins',
      choices,
      pageSize: 20,
    },
  ]);

  return answer.selected;
}

/**
 * Compute the next `manual` and `plugins` sources from the interactive
 * selections. Pure. The checkbox results become the new sources, but ids and
 * plugins the UI cannot manage (missing from the registry, applicable to no
 * configured tool, or with unavailable assets) are preserved from prior state
 * so a save never silently drops them.
 */
function computeNextSources({ state, selectionState, pluginSelection, plugins, assetsById, config, commit }) {
  const isManageable = (id) => {
    const asset = assetsById.get(id);
    return Boolean(asset) && assetAppliesToAnyTool(asset, config);
  };
  const preservedManual = (state.manual || []).filter((id) => !isManageable(id));
  const manual = [...new Set([...mergeSelections(selectionState), ...preservedManual])].sort();

  const isManageablePlugin = (name) => {
    const plugin = getPluginByName(plugins, name);
    return Boolean(plugin) && pluginInstallErrors(plugin, assetsById, config).length === 0;
  };
  const nextPlugins = {};
  for (const [name, record] of Object.entries(state.plugins || {})) {
    if (!isManageablePlugin(name)) {
      nextPlugins[name] = record;
    }
  }
  for (const name of pluginSelection) {
    const plugin = getPluginByName(plugins, name);
    if (plugin && isManageablePlugin(name)) {
      nextPlugins[name] = { assets: plugin.assets.slice(), commit };
    }
  }

  return { manual, plugins: nextPlugins };
}

function registerInstallCommand(program) {
  program
    .command('install')
    .description('Select assets and plugins to install across all tools')
    .option('--project <path>', 'Project root path')
    .option('--mode <mode>', 'Install mode (symlink|copy)')
    .action(async (options) => {
      const { config, repoPath, assets, projectRoot } = await prepare(options);
      if (assets.length === 0) {
        console.log('No assets found.');
        return;
      }

      const plugins = await loadPlugins(repoPath);
      const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

      const state = await loadState(projectRoot);
      const manualIds = new Set(state.manual || []);

      const grouped = groupAssetsByType(assets);
      const selectionState = initSelectionState(grouped, manualIds);

      // Seed plugin selection from enabled plugins that still exist in the registry.
      let pluginSelection = new Set();
      for (const name of Object.keys(state.plugins || {})) {
        if (getPluginByName(plugins, name)) {
          pluginSelection.add(name);
        }
      }

      // Main menu loop: configure each asset type or the plugins category, then save.
      while (true) {
        const selected = await showMainMenu(grouped, selectionState, plugins, pluginSelection);
        if (selected === null) {
          break;
        }
        if (selected === PLUGINS_KEY) {
          const newPluginSelection = await selectPlugins(plugins, assetsById, config, pluginSelection);
          pluginSelection = new Set(newPluginSelection);
          continue;
        }
        const typeAssets = grouped.get(selected);
        const currentSelection = selectionState.get(selected) || new Set();
        const newSelection = await selectAssetsForType(selected, typeAssets, config, currentSelection);
        selectionState.set(selected, new Set(newSelection));
      }

      const before = computeDesiredIds(state);
      const commit = await safeGetHeadCommit(repoPath);

      // Rebuild both sources from the checkbox selections (preserving items the
      // UI cannot manage), then let the shared reconcile persist the change.
      const next = computeNextSources({
        state, selectionState, pluginSelection, plugins, assetsById, config, commit,
      });
      state.manual = next.manual;
      state.plugins = next.plugins;

      const after = computeDesiredIds(state);

      if (before.size === after.size && [...before].every((id) => after.has(id))) {
        console.log('No changes to apply.');
        return;
      }

      const summary = await reconcile({ projectRoot, config, assets, commit, mode: options.mode, state });
      reportReconcile({ label: null, before, after, summary, config });
    });
}

module.exports = {
  registerInstallCommand,
  computeNextSources,
};
