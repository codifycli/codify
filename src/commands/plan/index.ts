import { Args, Flags } from '@oclif/core'
import * as path from 'node:path';

import { PlanOrchestrator } from '../../orchestrators/plan.js';
import { BaseCommand } from '../../common/base-command.js';

export default class Plan extends BaseCommand {
  static description = 'Generate a plan based on a codify.json file. This plan will list ' +
    'out the changes Codify will need to make in order to meet the desired config.'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    // flag with a value (-p, --path=VALUE)
    path: Flags.string({ char: 'p', description: 'path to project' }),
  }

  async init(): Promise<void> {
    console.log('Running Codify plan...')
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Plan)

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');

    const { plan } = await PlanOrchestrator.run(resolvedPath, flags.secure);
    this.reporter.displayPlan(plan);

    process.exit(0);
  }
}
