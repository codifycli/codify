import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { PlanOrchestrator } from './plan.js';

export interface ApplyArgs {
  path?: string;
  secure?: boolean;
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

    ctx.processStarted(ProcessName.APPLY);
    await pluginManager.apply(project, filteredPlan);
    ctx.processFinished(ProcessName.APPLY);

    await reporter.displayApplyComplete([]);
  },
};
