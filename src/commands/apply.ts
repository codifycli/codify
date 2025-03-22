import { Flags } from '@oclif/core'
import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { ApplyOrchestrator } from '../orchestrators/apply.js';

export default class Apply extends BaseCommand {
  static description =
`Install or update resources on the system based on a codify.json file.

Codify first generates a plan to determine the necessary execution steps. See
${chalk.bold.bgMagenta(' codify plan --help ')} for more details.
The execution plan will be presented and approval will be asked before Codify applies
any changes.

For scripts: use ${chalk.bold.bgMagenta(' --output json ')} which will skip approval and 
apply changes directly.

For more information, visit: https://docs.codifycli.com/commands/apply
`

  static flags = {
    'sudoPassword': Flags.string({
      optional: true,
      description: 'Automatically use this password for any commands that require elevated permissions.',
      char: 'S'
    }),
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
    const { flags } = await this.parse(Apply)

    await ApplyOrchestrator.run({
      path: flags.path,
      verbosityLevel: flags.debug ? 3 : 0,
      // secure: flags.secure,
    }, this.reporter);

    process.exit(0);
  }
}
