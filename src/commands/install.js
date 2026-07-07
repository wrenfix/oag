'use strict';

const inquirer = require('inquirer');
const { loadState } = require('../lib/state');
const { reconcile, computeDesiredIds, applicableTools, assetAppliesToAnyTool } = require('../lib/reconcile');
const { safeGetHeadCommit } = require('../lib/git');
const { prepare, reportReconcile } = require('./shared');

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

async function showMainMenu(grouped, selectionState) {
  const typeChoices = [];
  for (const [type, typeAssets] of grouped) {
    const enabledCount = (selectionState.get(type) || new Set()).size;
    const label = enabledCount > 0
      ? `${type} (${typeAssets.length} total, ${enabledCount} enabled)`
      : `${type} (${typeAssets.length} total)`;
    typeChoices.push({ name: label, value: type });
  }

  typeChoices.sort((a, b) => a.value.localeCompare(b.value));
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

function registerInstallCommand(program) {
  program
    .command('install')
    .description('Select assets to install across all tools')
    .option('--project <path>', 'Project root path')
    .option('--mode <mode>', 'Install mode (symlink|copy)')
    .action(async (options) => {
      const { config, repoPath, assets, projectRoot } = await prepare(options);
      if (assets.length === 0) {
        console.log('No assets found.');
        return;
      }

      const state = await loadState(projectRoot);
      const manualIds = new Set(state.manual || []);

      const grouped = groupAssetsByType(assets);
      const selectionState = initSelectionState(grouped, manualIds);

      // Main menu loop: configure each type, then save and exit.
      while (true) {
        const selectedType = await showMainMenu(grouped, selectionState);
        if (selectedType === null) {
          break;
        }
        const typeAssets = grouped.get(selectedType);
        const currentSelection = selectionState.get(selectedType) || new Set();
        const newSelection = await selectAssetsForType(selectedType, typeAssets, config, currentSelection);
        selectionState.set(selectedType, new Set(newSelection));
      }

      // Preserve manual ids that the UI cannot manage (missing from the registry
      // or applicable to no configured tool) so a save never silently drops them.
      const registryById = new Map(assets.map((asset) => [asset.id, asset]));
      const isManageable = (id) => {
        const asset = registryById.get(id);
        return Boolean(asset) && assetAppliesToAnyTool(asset, config);
      };

      const before = computeDesiredIds(state);
      const preservedManual = (state.manual || []).filter((id) => !isManageable(id));
      state.manual = [...new Set([...mergeSelections(selectionState), ...preservedManual])].sort();
      const after = computeDesiredIds(state);

      if (before.size === after.size && [...before].every((id) => after.has(id))) {
        console.log('No changes to apply.');
        return;
      }

      const commit = await safeGetHeadCommit(repoPath);
      const summary = await reconcile({ projectRoot, config, assets, commit, mode: options.mode, state });
      reportReconcile({ label: null, before, after, summary, config });
    });
}

module.exports = {
  registerInstallCommand,
};
