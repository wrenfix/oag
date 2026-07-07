'use strict';

const { loadState } = require('../lib/state');
const { reconcile, computeDesiredIds } = require('../lib/reconcile');
const { safeGetHeadCommit } = require('../lib/git');
const { prepare, reportFailures } = require('./shared');

function registerUpdateCommand(program) {
  program
    .command('update')
    .description('Reinstall managed assets at the latest registry commit')
    .option('--project <path>', 'Project root path')
    .option('--mode <mode>', 'Install mode (symlink|copy)')
    .action(async (options) => {
      const { config, repoPath, assets, projectRoot } = await prepare(options);
      const commit = await safeGetHeadCommit(repoPath);

      const state = await loadState(projectRoot);
      if (computeDesiredIds(state).size === 0) {
        console.log('No managed assets to update.');
        return;
      }

      const summary = await reconcile({ projectRoot, config, assets, commit, mode: options.mode, state });

      let installed = 0;
      for (const perTool of Object.values(summary.tools || {})) {
        installed += perTool.installed.length;
      }

      console.log(`Reinstalled ${installed} asset(s) across ${Object.keys(summary.tools || {}).length} tools.`);
      reportFailures(summary);
    });
}

module.exports = {
  registerUpdateCommand,
};
