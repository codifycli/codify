import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { InitializeOrchestrator } from '../orchestrators/init.js';
import { Flags } from '@oclif/core';

export default class Init extends BaseCommand {
  static strict = false;

  static override description =
`A helper to quickly get started with Codify.

Use this command to automatically generate Codify configs based on
the currently installed system resources. By default, the new file 
will be written to ${chalk.bold.bgMagenta(' ~/codify.jsonc ')}.

For more information, visit: https://docs.codifycli.com/commands/init`

  static baseFlags= {
    ...BaseCommand.baseFlags,
    includeSensitive: Flags.boolean({
      description: 'Include sensitive resources in the generated configs.',
    }),
  }

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Init)

    await InitializeOrchestrator.run({
      verbosityLevel: flags.debug ? 3 : 0,
      path: flags.path,
      includeSensitive: flags.includeSensitive,
    },this.reporter);

    process.exit(0)
  }
}
