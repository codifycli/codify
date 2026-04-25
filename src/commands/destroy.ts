import { Flags } from '@oclif/core';
import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { DestroyOrchestrator } from '../orchestrators/destroy.js';

export default class Destroy extends BaseCommand {
  static strict = false;
  static description =
`Use Codify to uninstall a supported package or setting on the system.

This command will only work for resources with Codify support. This command
can work with or without a codify.jsonc file. 

${chalk.bold('Modes:')}
 • If a codify.jsonc file exists, destroy the resource specified in the Codify.jsonc file
with a matching type. 
 • If a codify.jsonc file doesn't exist, additional information may be asked to identify
the specific resource to destroy.

For more information, visit: https://codifycli.com/docs/commands/destory`

  static examples = [
    '<%= config.bin %> <%= command.id %> homebrew nvm',
    '<%= config.bin %> <%= command.id %> homebrew nvm --path=~',
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    'sudoPassword': Flags.string({
      optional: true,
      description: 'Automatically use this password for any handlers that require elevated permissions.',
      char: 'S',
      helpValue: '<password>'
    }),
    'yes': Flags.boolean({
      description: 'Automatically approve the destroy without prompting for confirmation.',
      char: 'y',
      default: false,
    }),
    'verbose': Flags.boolean({
      char: 'v',
      description: 'Print plugin output (stdout/stderr) to the terminal.',
    }),
  }

  public async run(): Promise<void> {
    const { flags, raw } = await this.parse(Destroy)

    if (flags.output !== 'json') {
      console.log('Running Codify destroy...')
    }

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    await DestroyOrchestrator.run({
      verbosityLevel: flags.debug || flags.verbose ? 3 : 0,
      typeIds: args,
      path: flags.path,
      autoApprove: flags.yes,
    }, this.reporter)

    process.exit(0);
  }
}
