'use strict';

const path = require('path');
const { saveState, getTypeFromId } = require('./state');
const { installMcp, uninstallMcpByState } = require('./mcp');
const { installSubagentToml, subagentNeedsTomlConversion } = require('./subagent');
const { installAsset, removeTargets, inferBaseDir, normalizeMode } = require('./installers');
const { pruneEmptyDirs } = require('./prune');

function isToolSupported(asset, tool) {
  return !asset.tools || asset.tools.includes(tool);
}

function toolHasMapping(toolConfig, asset) {
  return Boolean(toolConfig && toolConfig.paths && toolConfig.paths[asset.type]);
}

/**
 * Configured tools an asset would be applied to: compatible via its `tools`
 * field and the tool maps its type.
 */
function applicableTools(asset, config) {
  return Object.keys(config.tools || {}).filter((tool) =>
    isToolSupported(asset, tool) && toolHasMapping(config.tools[tool], asset)
  );
}

function assetAppliesToAnyTool(asset, config) {
  return applicableTools(asset, config).length > 0;
}

function resolveDesiredMode(item, forcedMode) {
  if (forcedMode) {
    return forcedMode;
  }
  if (item && item.mode) {
    return normalizeMode(item.mode);
  }
  return 'copy';
}

/**
 * The tool-agnostic union of enabled sources: manually installed assets plus
 * every enabled plugin's assets. Legacy `hook` ids are dropped.
 */
function computeDesiredIds(state) {
  const ids = new Set();
  const add = (id) => {
    if (id && getTypeFromId(id) !== 'hook') {
      ids.add(id);
    }
  };
  for (const id of state.manual || []) {
    add(id);
  }
  for (const plugin of Object.values(state.plugins || {})) {
    const assets = plugin && Array.isArray(plugin.assets) ? plugin.assets : [];
    for (const id of assets) {
      add(id);
    }
  }
  return ids;
}

/**
 * Uninstall a recorded item. The item's own stored shape is authoritative:
 * an `mcp` snapshot rolls back the shared config, everything else removes its
 * target files (and prunes emptied per-asset directories).
 */
async function uninstallItem({ item, asset, projectRoot, toolConfig }) {
  if (!item) {
    return;
  }

  if (item.mcp) {
    await uninstallMcpByState(projectRoot, toolConfig, item.mcp);
    return;
  }

  if (Array.isArray(item.targets)) {
    await removeTargets(item.targets);

    const baseDir = await inferBaseDir({ item, asset, projectRoot, toolPaths: toolConfig.paths });
    if (baseDir) {
      const stopDir = path.dirname(baseDir);
      for (const target of item.targets) {
        await pruneEmptyDirs(path.dirname(target), stopDir);
      }
    }
  }
}

async function installItem({ asset, tool, projectRoot, toolConfig, mode, commit }) {
  if (asset.type === 'mcp') {
    const { targets, mcpState } = await installMcp(asset, projectRoot, tool, toolConfig);
    return { targets, mode, commit, mcp: mcpState };
  }

  if (asset.type === 'subagent' && subagentNeedsTomlConversion(toolConfig)) {
    const { targets } = await installSubagentToml(asset, projectRoot, toolConfig);
    return { targets, mode, commit };
  }

  const { targets, baseDir } = await installAsset({
    asset,
    projectRoot,
    toolPaths: toolConfig.paths,
    mode,
  });
  return baseDir ? { targets, mode, commit, baseDir } : { targets, mode, commit };
}

/**
 * Sync every configured tool's installed items to the desired source set.
 * Declarative: `desired = manual ∪ enabled plugins`; each tool installs the
 * subset it supports. Full teardown + rebuild so removals and shared assets
 * resolve deterministically. Every fs step is guarded so a single failure is
 * recorded rather than aborting the run and leaving state unpersisted.
 * Mutates and persists `state`.
 */
async function reconcile({ projectRoot, config, assets, commit, mode, state }) {
  const assetsById = new Map((assets || []).map((asset) => [asset.id, asset]));
  const forcedMode = mode ? normalizeMode(mode) : null;
  const desired = computeDesiredIds(state);

  const summary = { tools: {} };

  for (const tool of Object.keys(config.tools || {})) {
    const toolConfig = config.tools[tool];
    if (!toolConfig || !toolConfig.paths) {
      continue;
    }

    const perTool = { installed: [], failed: [] };
    summary.tools[tool] = perTool;

    const prior = (state.tools[tool] && state.tools[tool].items) || {};

    // Desired assets this tool can actually take.
    const applicable = new Set(
      [...desired].filter((id) => {
        const asset = assetsById.get(id);
        return asset && isToolSupported(asset, tool) && toolHasMapping(toolConfig, asset);
      })
    );

    // Still wanted but missing from the registry and previously installed:
    // leave the existing files/state untouched rather than tearing them down.
    const preserveMissing = new Set(
      [...desired].filter((id) => !assetsById.has(id) && prior[id])
    );

    const nextItems = {};

    // Teardown in reverse insertion order so chained mcpState rolls back cleanly.
    const priorEntries = Object.entries(prior);
    for (let i = priorEntries.length - 1; i >= 0; i--) {
      const [id, item] = priorEntries[i];
      if (getTypeFromId(id) === 'hook' || preserveMissing.has(id)) {
        nextItems[id] = item;
        continue;
      }
      try {
        await uninstallItem({ item, asset: assetsById.get(id), projectRoot, toolConfig });
      } catch (error) {
        // Keep the record so state stays consistent with what is still on disk.
        nextItems[id] = item;
        perTool.failed.push({ id, error: `uninstall: ${error.message}` });
      }
    }

    // Rebuild the applicable set (sorted for stable install order).
    for (const id of [...applicable].sort()) {
      const asset = assetsById.get(id);
      const desiredMode = resolveDesiredMode(prior[id], forcedMode);
      try {
        nextItems[id] = await installItem({
          asset,
          tool,
          projectRoot,
          toolConfig,
          mode: desiredMode,
          commit,
        });
        perTool.installed.push(id);
      } catch (error) {
        perTool.failed.push({ id, error: error.message });
      }
    }

    state.tools[tool] = { items: nextItems };
  }

  await saveState(projectRoot, state);
  return summary;
}

module.exports = {
  reconcile,
  computeDesiredIds,
  applicableTools,
  assetAppliesToAnyTool,
  isToolSupported,
};
