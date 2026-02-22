import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { sleep } from '../utils/index.js';
import { PlanOrchestrator } from './plan.js';

export interface ApplyArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
  noProgress?: boolean;
}

export const ApplyOrchestrator = {
  async run(args: ApplyArgs, reporter: Reporter): Promise<void> {
    const planResult = await PlanOrchestrator.run(args, reporter);

    // Short circuit and exit if every change is NOOP
    if (planResult.plan.isEmpty()) {
      console.log('No changes necessary. Exiting');
      return process.exit(0);
    }

    const confirm = await reporter.promptConfirmation('Do you want to continue?')
    if (!confirm) {
      return process.exit(0);
    }
    
    const { plan, pluginManager, project } = planResult;
    const filteredPlan = plan.filterNoopResources()

    if (!args.noProgress) ctx.processStarted(ProcessName.APPLY);
    if (!args.noProgress) await reporter.displayProgress();

    await pluginManager.apply(project, filteredPlan);
    if (!args.noProgress) ctx.processFinished(ProcessName.APPLY);

    reporter.displayMessage(`
🎉 Finished applying 🎉
Open a new terminal or source '.zshrc' for the new changes to be reflected`);

    // Need to sleep to wait for the message to display before we exit
    await sleep(100);
  },
};
