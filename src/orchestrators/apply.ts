import { ProcessName, ctx } from '../events/context.js';
import { DefaultReporter } from '../ui/reporters/default-reporter.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { sleep } from '../utils/index.js';
import { VerbosityLevel } from '../utils/verbosity-level.js';
import { PlanOrchestrator } from './plan.js';

export interface ApplyArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
  noProgress?: boolean;
  autoApprove?: boolean;
}

export const ApplyOrchestrator = {
  async run(args: ApplyArgs, reporter: Reporter): Promise<void> {
    const planResult = await PlanOrchestrator.run(args, reporter);

    // Short circuit and exit if every change is NOOP
    if (planResult.plan.isEmpty()) {
      console.log('No changes necessary. Exiting');
      return process.exit(0);
    }

    if (!args.autoApprove) {
      const confirm = await reporter.promptConfirmation('Do you want to continue?')
      if (!confirm) {
        return process.exit(0);
      }
    }
    
    const { plan, pluginManager, project } = planResult;
    const filteredPlan = plan.filterNoopResources()

    let currentVerbosity = args.verbosityLevel ?? 0;
    if (reporter instanceof DefaultReporter) {
      reporter.onVerbosityToggle(async () => {
        currentVerbosity = currentVerbosity === 0 ? 3 : 0;
        await pluginManager.setVerbosityLevel(currentVerbosity);
      });
    }

    if (!args.noProgress) ctx.processStarted(ProcessName.APPLY);
    if (!args.noProgress) await reporter.displayProgress();

    await pluginManager.apply(project, filteredPlan);
    if (!args.noProgress) ctx.processFinished(ProcessName.APPLY);

    // Need to sleep to wait for the message to display before we exit
    await sleep(100);

    await reporter.displayMessage(`
🎉 Finished applying 🎉
Open a new terminal or source '.zshrc' for the new changes to be reflected`);
  },
};
