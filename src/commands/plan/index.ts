import { Args, Flags } from '@oclif/core'
import * as path from 'node:path';

import { PlanOrchestrator } from '../../orchestrators/plan.js';
import { BaseCommand } from '../../common/base-command.js';

export default class Plan extends BaseCommand {
  static args = {
    file: Args.string({ description: 'file to read' }),
  }

  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

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

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');

    const { plan } = await PlanOrchestrator.run(resolvedPath);
    this.reporter.displayPlan(plan);

    process.exit(0);
  }
}
