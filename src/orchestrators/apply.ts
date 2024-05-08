import { ResourceOperation } from 'codify-schemas';

import { ctx, ProcessName } from '../events/context.js';
import { PlanOrchestratorResponse } from './plan.js';

export const ApplyOrchestrator = {
  async run(planResult: PlanOrchestratorResponse): Promise<void> {
    const { plan, pluginCollection } = planResult;
    const filteredPlan = plan
      .filter((p) => p.operation !== ResourceOperation.NOOP)

    ctx.processStarted(ProcessName.APPLY);
    await pluginCollection.apply(filteredPlan);
    await pluginCollection.destroy();
    ctx.processFinished(ProcessName.APPLY);
  },
};
