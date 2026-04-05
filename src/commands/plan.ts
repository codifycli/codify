import chalk from 'chalk';
import { BaseCommand } from '../common/base-command.js';
import { PlanOrchestrator } from '../orchestrators/plan.js';
import { Args } from '@oclif/core';

export default class Plan extends BaseCommand {
  static description =
`Generate an execution plan to apply changes from a codify.jsonc file.
 
This plan lists all the changes Codify needs to make to apply the codify.jsonc file.
The plan will not be executed. Behind the scenes, Codify performs a refresh scan to 
determine the current configuration and installed resources, then compares them with 
the desired configuration to compute the execution plan.

For scripts: use ${chalk.bold.bgMagenta(' --output json ')} which will skip all prompts and print
 only the final result as a json.

For more information, visit: https://codifycli.com/docs/commands/plan`

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -o json',
    '<%= config.bin %> <%= command.id %> -p ../',
  ]

  static args = {
    pathArgs: Args.string(),
  }

  async init(): Promise<void> {
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Plan)

    if (flags.path && args.pathArgs) {
      throw new Error('Cannot specify both --path and path argument');
    }

    await PlanOrchestrator.run({
      verbosityLevel: flags.debug ? 3 : 0,
      path: flags.path ?? args.pathArgs,
      secureMode: flags.secure,
    }, this.reporter);

    process.exit(0);
  }
}
