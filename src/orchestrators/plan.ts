import { PlanResponseData } from 'codify-schemas';

import { Project } from '../entities/project.js';
import { ctx, ProcessName, SubProcessName } from '../events/context.js';
import { Parser } from '../parser/index.js';
import { PluginCollection } from '../plugins/plugin-collection.js';

export interface PlanOrchestratorResponse {
  plan: PlanResponseData[],
  pluginCollection: PluginCollection;
  project: Project;
}

export const PlanOrchestrator = {
  async run(path: string, destroyPlugins = true): Promise<PlanOrchestratorResponse> {
    ctx.processStarted(ProcessName.PLAN)

    ctx.subprocessStarted(SubProcessName.PARSE);
    const project = await Parser.parseProject(path);
    ctx.subprocessFinished(SubProcessName.PARSE);

    ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginCollection = new PluginCollection();
    const dependencyMap = await pluginCollection.initialize(project);
    ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    ctx.subprocessStarted(SubProcessName.VALIDATE)
    project.validateWithResourceMap(dependencyMap);
    project.resolveResourceDependencies(dependencyMap);

    const validationResults = await pluginCollection.validate(project);
    project.handlePluginResourceValidationResults(validationResults);
    project.calculateEvaluationOrder();
    ctx.subprocessFinished(SubProcessName.VALIDATE)


    ctx.subprocessStarted(SubProcessName.GENERATE_PLAN)
    const plan = await pluginCollection.getPlan(project);
    ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    if (destroyPlugins) {
      await pluginCollection.destroy();
    }

    ctx.processFinished(ProcessName.PLAN)

    return {
      plan,
      pluginCollection,
      project,
    };
  },
};
