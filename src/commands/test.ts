import { Args, Flags } from '@oclif/core'
import chalk from 'chalk';
import { OS } from '@codifycli/schemas';
import os from 'node:os';

import { BaseCommand } from '../common/base-command.js';
import { ctx } from '../events/context.js';
import { TestOrchestrator } from '../orchestrators/test.js';

export default class Test extends BaseCommand {
  static description =
`Install or update resources on the system based on a codify.jsonc file.

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
      description: 'Automatically use this password for any handlers that require elevated permissions.',
      char: 'S'
    }),
    'operatingSystem': Flags.string({
      options: ['macOS', 'linux'],
      optional: true,
      description: 'Operating system to use for the test VM. Defaults to the host operating system.',
      char: 'o',
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
    ctx.log('Running Codify test...')
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Test)

    if (flags.path && args.pathArgs) {
      throw new Error('Cannot specify both --path and path argument');
    }

    const hostSystem = os.platform() === 'darwin' ? OS.Darwin : OS.Linux;
    const osFlag = flags.operatingSystem === 'macOS' ? OS.Darwin :
      flags.operatingSystem === 'linux' ? OS.Linux : hostSystem;

    await TestOrchestrator.run({
      path: flags.path ?? args.pathArgs,
      verbosityLevel: flags.debug ? 3 : 0,
      vmOs: osFlag,
      // secure: flags.secure,
    }, this.reporter);

    process.exit(0);
  }
}
