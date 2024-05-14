import { PlanResponseData, ResourceOperation } from 'codify-schemas';
import { randomUUID } from 'node:crypto';

import { ctx, ProcessName } from '../events/context.js';
import { CommonOrchestrator } from './common.js';

export const UninstallOrchestrator = {
  async run(typeIds: string[]): Promise<void> {
    if (typeIds.length === 0) {
      return;
    }

    const plan = typeIds.map((type) => ({
      operation: ResourceOperation.DESTROY,
      parameters: [] as any[],
      planId: randomUUID(),
      resourceType: type,
    } as PlanResponseData))

    const { pluginCollection } = await CommonOrchestrator.initializePlugins();

    ctx.processStarted(ProcessName.UNINSTALL);

    await pluginCollection.apply(plan);
    await pluginCollection.destroy();

    ctx.processFinished(ProcessName.UNINSTALL);
  },
};
