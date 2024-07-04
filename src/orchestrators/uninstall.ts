import { PlanResponseData, ResourceOperation } from 'codify-schemas';
import { randomUUID } from 'node:crypto';

import { CommonOrchestrator } from '../common/orchestrator.js';
import { ctx, ProcessName, SubProcessName } from '../events/context.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { CodifyParser } from '../parser/index.js';
import { Project } from '../entities/project.js';

export const UninstallOrchestrator = {
  async run(typeIds: string[], path: string | null, secureMode: boolean): Promise<void> {
    if (typeIds.length === 0) {
      return;
    }

    ctx.processStarted(ProcessName.PLAN)

    ctx.subprocessStarted(SubProcessName.PARSE);
    let project: Project | null = null;
    if (path) {
      const parsedProject = await CodifyParser.parse(path);
      project = parsedProject.filter(typeIds) // We only care about the types being uninstalled
    }
    ctx.subprocessFinished(SubProcessName.PARSE);

    const { pluginManager, dependencyMap } = await CommonOrchestrator.initializePlugins(project, secureMode);

    if (project) {
      ctx.subprocessStarted(SubProcessName.VALIDATE)
      project.validateWithResourceMap(dependencyMap);
      project.resolveResourceDependencies(dependencyMap);

      const validationResults = await pluginManager.validate(project);
      project.handlePluginResourceValidationResults(validationResults);
      project.calculateEvaluationOrder();
      ctx.subprocessFinished(SubProcessName.VALIDATE)
    }

    ctx.processStarted(ProcessName.UNINSTALL);
    // await pluginManager.apply(plan);
    ctx.processFinished(ProcessName.UNINSTALL);

    const plan = typeIds.map((type) => ({
      operation: ResourceOperation.DESTROY,
      parameters: [] as any[],
      planId: randomUUID(),
      resourceType: type,
    } as PlanResponseData))
  },
};
