import { ResourceOperation } from 'codify-schemas';

import { ctx, ProcessName } from '../events/context.js';
import { PlanOrchestratorResponse } from './plan.js';

export const ApplyOrchestrator = {
  async run(planResult: PlanOrchestratorResponse): Promise<void> {
    const { plan, pluginManager, project } = planResult;
    const filteredPlan = plan
      .filter((p) => p.operation !== ResourceOperation.NOOP)

    ctx.processStarted(ProcessName.APPLY);
    await pluginManager.apply(project, filteredPlan);
    ctx.processFinished(ProcessName.APPLY);
  },
};
