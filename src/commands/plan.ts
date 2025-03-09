import chalk from 'chalk';
import { BaseCommand } from '../common/base-command.js';
import { PlanOrchestrator } from '../orchestrators/plan.js';

export default class Plan extends BaseCommand {
  static description =
`Generate an execution plan to apply changes from a codify.json file.
 
This plan lists all the changes Codify needs to make to apply the codify.json file.
The plan will not be executed. Behind the scenes, Codify performs a refresh scan to 
determine the current configuration and installed resources, then compares them with 
the desired configuration to compute the execution plan.

For scripts: use ${chalk.bold.bgMagenta(' --output json ')} which will skip all prompts and print
 only the final result as a json.

For more information, visit: https://docs.codifycli.com/commands/plan`

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -o json',
    '<%= config.bin %> <%= command.id %> -p ../',
  ]

  async init(): Promise<void> {
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Plan)

    await PlanOrchestrator.run({
      path: flags.path,
      secureMode: flags.secure,
    }, this.reporter);

    process.exit(0);
  }
}
