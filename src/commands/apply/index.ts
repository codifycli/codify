import { Args, Command, Flags } from '@oclif/core'
import { ResourceOperation } from 'codify-schemas';
import path from 'node:path';

import { ApplyOrchestrator } from '../../orchestrators/apply.js';
import { PlanOrchestrator } from '../../orchestrators/plan.js';
import { DefaultReporter } from '../../ui/reporters/default-reporter.js';

export default class Apply extends Command {
  static args = {
    file: Args.string({ description: 'file to read' }),
  }

  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    // flag with a value (-p, --path=VALUE)
    path: Flags.string({ char: 'p', description: 'path to project' }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Apply)
    const reporter = new DefaultReporter()

    try {
      if (flags.path) {
        this.log(`Applying Codify from: ${flags.path}`);
      }

      const resolvedPath = path.resolve(flags.path ?? '.');

      const planResult = await PlanOrchestrator.run(resolvedPath, false);
      reporter.displayPlan(planResult.plan);

      // Short circuit and exit if every change is NOOP
      if (planResult.plan.every((p) => p.operation === ResourceOperation.NOOP)) {
        console.log('No changes necessary. Exiting');
        await planResult.pluginCollection.destroy();
        return process.exit(0);
      }

      const confirm = await reporter.promptApplyConfirmation()
      if (!confirm) {
        return process.exit(0);
      }

      await ApplyOrchestrator.run(planResult);
    } catch (error: unknown) {
      console.error(error);
      process.exit(1);
    }

    process.exit(0);
  }
}
