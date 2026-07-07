'use strict';

const path = require('path');
const inquirer = require('inquirer');
const { loadPlugins, getPluginByName } = require('../lib/plugins');
const { loadState } = require('../lib/state');
const { reconcile, computeDesiredIds, assetAppliesToAnyTool } = require('../lib/reconcile');
const { safeGetHeadCommit } = require('../lib/git');
const { prepare, syncRegistry, reportReconcile } = require('./shared');

async function resolvePlugin(plugins, provided) {
  if (provided) {
    const plugin = getPluginByName(plugins, provided);
    if (plugin) {
      return plugin;
    }
    const available = plugins.map((entry) => entry.name).join(', ');
    throw new Error(`Plugin '${provided}' not found. Available plugins: ${available || '(none)'}.`);
  }

  if (plugins.length === 0) {
    throw new Error('No plugins found in registry.');
  }

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'plugin',
      message: 'Select a plugin',
      choices: plugins.map((plugin) => ({
        name: plugin.description ? `${plugin.name} - ${plugin.description}` : plugin.name,
        value: plugin.name,
      })),
      pageSize: 20,
    },
  ]);

  return getPluginByName(plugins, answer.plugin);
}

function validatePluginAssets(plugin, assetsById, config) {
  const errors = [];
  for (const id of plugin.assets) {
    const asset = assetsById.get(id);
    if (!asset) {
      errors.push(`- ${id}: asset not found in registry`);
      continue;
    }
    if (!assetAppliesToAnyTool(asset, config)) {
      errors.push(`- ${id}: not applicable to any configured tool`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Plugin '${plugin.name}' has invalid assets:\n${errors.join('\n')}`);
  }
}

/**
 * Apply a source mutation and reconcile: snapshot the desired union, mutate the
 * sources, reconcile every tool, then report the delta. `mutate(state, commit)`
 * is the only thing that differs between enabling and disabling a plugin.
 */
async function applyAndReport({ ctx, mode, state, label, mutate }) {
  const before = computeDesiredIds(state);
  const commit = await safeGetHeadCommit(ctx.repoPath);
  mutate(state, commit);
  const after = computeDesiredIds(state);

  const summary = await reconcile({
    projectRoot: ctx.projectRoot,
    config: ctx.config,
    assets: ctx.assets,
    commit,
    mode,
    state,
  });
  reportReconcile({ label, before, after, summary, config: ctx.config });
}

function registerPluginCommand(program) {
  const plugin = program
    .command('plugin')
    .description('Enable, disable, and list plugins (bundles of assets applied to all tools)');

  plugin
    .command('add [name]')
    .description('Enable a plugin (coexists with already-enabled plugins)')
    .option('--project <path>', 'Project root path')
    .option('--mode <mode>', 'Install mode (symlink|copy)')
    .action(async (name, options) => {
      const ctx = await prepare(options);
      const plugins = await loadPlugins(ctx.repoPath);
      const selected = await resolvePlugin(plugins, name);

      const assetsById = new Map(ctx.assets.map((asset) => [asset.id, asset]));
      validatePluginAssets(selected, assetsById, ctx.config);

      const state = await loadState(ctx.projectRoot);
      await applyAndReport({
        ctx,
        mode: options.mode,
        state,
        label: `Enabled plugin '${selected.name}'`,
        mutate: (s, commit) => {
          s.plugins[selected.name] = { assets: selected.assets.slice(), commit };
        },
      });
    });

  plugin
    .command('remove <name>')
    .description('Disable a plugin (keeps assets still required by other sources)')
    .option('--project <path>', 'Project root path')
    .option('--mode <mode>', 'Install mode (symlink|copy)')
    .action(async (name, options) => {
      // Skip the registry sync entirely if the plugin was never enabled.
      const projectRoot = path.resolve(options.project || process.cwd());
      const state = await loadState(projectRoot);
      if (!state.plugins[name]) {
        console.log(`Plugin '${name}' is not enabled.`);
        return;
      }

      const ctx = await prepare(options);
      await applyAndReport({
        ctx,
        mode: options.mode,
        state,
        label: `Disabled plugin '${name}'`,
        mutate: (s) => {
          delete s.plugins[name];
        },
      });
    });

  plugin
    .command('list')
    .description('List available plugins and which are enabled')
    .option('--project <path>', 'Project root path')
    .action(async (options) => {
      const { repoPath, projectRoot } = await syncRegistry(options);
      const plugins = await loadPlugins(repoPath);
      const state = await loadState(projectRoot);
      const enabled = new Set(Object.keys(state.plugins || {}));

      if (plugins.length === 0 && enabled.size === 0) {
        console.log('No plugins found.');
        return;
      }

      const known = new Set();
      for (const entry of plugins) {
        known.add(entry.name);
        const base = entry.description ? `${entry.name} - ${entry.description}` : entry.name;
        const tag = enabled.has(entry.name) ? ' [enabled]' : '';
        console.log(`${base} (${entry.assets.length} assets)${tag}`);
      }

      for (const name of enabled) {
        if (!known.has(name)) {
          console.log(`${name} [enabled, not in registry]`);
        }
      }
    });
}

module.exports = {
  registerPluginCommand,
};
