import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { InitializeOrchestrator } from '../orchestrators/init.js';

export default class Init extends BaseCommand {
  static strict = false;

  static override description =
`A helper to quickly get started with Codify.

Use this command to automatically generate Codify configs based on
the currently installed system resources. By default, the new file 
will be written to ${chalk.bold.bgMagenta(' ~/codify.json ')}.

For more information, visit: https://docs.codifycli.com/commands/init`

  static baseFlags= {
    ...BaseCommand.baseFlags,
    path: { hidden: true } as any,
  }

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    await InitializeOrchestrator.run(this.reporter);
  }
}
