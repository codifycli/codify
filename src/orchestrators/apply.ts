import { ProcessName, ctx } from '../events/context.js';
import { PlanOrchestratorResponse } from './plan.js';

export const ApplyOrchestrator = {
  async run(planResult: PlanOrchestratorResponse): Promise<void> {
    const { plan, pluginManager, project } = planResult;
    const filteredPlan = plan.filterNoopResources()

    ctx.processStarted(ProcessName.APPLY);
    await pluginManager.apply(project, filteredPlan);
    ctx.processFinished(ProcessName.APPLY);
  },
};
