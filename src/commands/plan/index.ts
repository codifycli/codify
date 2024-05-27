import { Args, Command, Flags } from '@oclif/core'
import chalk from 'chalk';
import * as path from 'node:path';

import { PlanOrchestrator } from '../../orchestrators/plan.js';
import { DebugReporter } from '../../ui/reporters/debug-reporter.js';

export default class Plan extends Command {
  static args = {
    file: Args.string({ description: 'file to read' }),
  }

  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  protected async catch(err: Error): Promise<void> {
    console.log(chalk.red(err.message));
    process.exit(1);
  }

  static flags = {
    // flag with no value (-f, --force)
    force: Flags.boolean({ char: 'f' }),
    // flag with a value (-n, --name=VALUE)
    name: Flags.string({ char: 'n', description: 'name to print' }),
    // flag with a value (-p, --path=VALUE)
    path: Flags.string({ char: 'p', description: 'path to project' }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Plan)
    const reporter = new DebugReporter()

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');

    const { plan } = await PlanOrchestrator.run(resolvedPath);
    reporter.displayPlan(plan);

    process.exit(0);
  }
}
