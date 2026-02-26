'use strict';

const { Command } = require('commander');
const { version } = require('../package.json');
const { registerRemoteCommands } = require('./commands/remote');
const { registerListCommand } = require('./commands/list');
const { registerListPresetsCommand } = require('./commands/listPresets');
const { registerInstallCommand } = require('./commands/install');
const { registerPresetCommand } = require('./commands/preset');
const { registerUpdateCommand } = require('./commands/update');

const program = new Command();

program
  .name('oag')
  .description('AI CLI registry manager')
  .version(version);

registerRemoteCommands(program);
registerListCommand(program);
registerListPresetsCommand(program);
registerInstallCommand(program);
registerPresetCommand(program);
registerUpdateCommand(program);

program.parseAsync(process.argv).catch((error) => {
  const message = error && error.message ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
