import { PlanResponseData, ResourceOperation } from 'codify-schemas';
import { randomUUID } from 'node:crypto';

import { CommonOrchestrator } from '../common/orchestrator.js';
import { ctx, ProcessName } from '../events/context.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';

export const UninstallOrchestrator = {
  async run(typeIds: string[], secureMode: boolean): Promise<void> {
    if (typeIds.length === 0) {
      return;
    }

    const plan = typeIds.map((type) => ({
      operation: ResourceOperation.DESTROY,
      parameters: [] as any[],
      planId: randomUUID(),
      resourceType: type,
    } as PlanResponseData))

    const { pluginCollection } = await CommonOrchestrator.initializePlugins(undefined, secureMode);
    await createStartupShellScriptsIfNotExists();

    ctx.processStarted(ProcessName.UNINSTALL);
    await pluginCollection.apply(plan);
    ctx.processFinished(ProcessName.UNINSTALL);
  },
};
