import { ResourceOperation } from 'codify-schemas';

import { PlanOrchestrator } from './plan.js';

export const ApplyOrchestrator = {
  async run(rootDirectory: string): Promise<void> {
    const { plan, pluginCollection } = await PlanOrchestrator.run(rootDirectory, false);

    // Short circuit and exit if every change is NOOP
    if (plan.every((p) => p.operation === ResourceOperation.NOOP)) {
      console.log('No changes necessary. Exiting');
      await pluginCollection.destroy();
      return;
    }

    await pluginCollection.apply(plan);
    await pluginCollection.destroy();
  },
};
