import { Args, Flags } from '@oclif/core'
import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { ApplyOrchestrator } from '../orchestrators/apply.js';

export default class Apply extends BaseCommand {
  static description =
`Install or update resources on the system based on a codify.jsonc file.

Codify first generates a plan to determine the necessary execution steps. See
${chalk.bold.bgMagenta(' codify plan --help ')} for more details.
The execution plan will be presented and approval will be asked before Codify applies
any changes.

For scripts: use ${chalk.bold.bgMagenta(' --output json ')} which will skip approval and 
apply changes directly.

For more information, visit: https://codifycli.com/docs/commands/apply
`

  static flags = {
    'sudoPassword': Flags.string({
      optional: true,
      description: 'Automatically use this password for any handlers that require elevated permissions.',
      char: 'S'
    }),
    'yes': Flags.boolean({
      description: 'Automatically approve the apply without prompting for confirmation.',
      char: 'y',
      default: false,
    }),
  }

  static args = {
    pathArgs: Args.string(),
  }

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path ~',
    '<%= config.bin %> <%= command.id %> -o json',
    '<%= config.bin %> <%= command.id %> -S <sudo password>',
  ]

  async init(): Promise<void> {
    console.log('Running Codify apply...')
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Apply)

    if (flags.path && args.pathArgs) {
      throw new Error('Cannot specify both --path and path argument');
    }

    await ApplyOrchestrator.run({
      path: flags.path ?? args.pathArgs,
      verbosityLevel: flags.debug ? 3 : 0,
      autoApprove: flags.yes,
      // secure: flags.secure,
    }, this.reporter);

    process.exit(0);
  }
}
