import { Args, Flags } from '@oclif/core'
import * as path from 'node:path';

import { BaseCommand } from '../../common/base-command.js';
import { ApplyOrchestrator } from '../../orchestrators/apply.js';
import { PlanOrchestrator } from '../../orchestrators/plan.js';

export default class Apply extends BaseCommand {
  static description = 'Apply a codify.json file. Codify apply will first generate a plan ' +
    'of the changes needed to meet the desired config in the codify.json file. The user will have ' +
    'the option to then apply the plan.'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    // flag with a value (-p, --path=VALUE)
    path: Flags.string({ char: 'p', description: 'path to project' }),
  }

  async init(): Promise<void> {
    console.log('Running Codify apply...')
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Apply)

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');

    const planResult = await PlanOrchestrator.run(resolvedPath, flags.secure);
    this.reporter.displayPlan(planResult.plan);

    // Short circuit and exit if every change is NOOP
    if (planResult.plan.isEmpty()) {
      console.log('No changes necessary. Exiting');
      return process.exit(0);
    }

    const confirm = await this.reporter.promptApplyConfirmation()
    if (!confirm) {
      return process.exit(0);
    }

    await ApplyOrchestrator.run(planResult);
    await this.reporter.displayApplyComplete([]);

    process.exit(0);
  }
}
