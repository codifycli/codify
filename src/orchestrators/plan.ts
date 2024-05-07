import { PlanResponseData } from 'codify-schemas';

import { Project } from '../entities/project.js';
import { ctx } from '../events/context.js';
import { Parser } from '../parser/index.js';
import { PluginCollection } from '../plugins/plugin-collection.js';

interface PlanOchestratorResponse {
  plan: PlanResponseData[],
  pluginCollection: PluginCollection;
  project: Project;
}

export enum PlanStatus {
  GENERATE_PLAN = 'generate_plan',
  INITIALIZE_PLUGINS = 'initalize_plugins',
  PARSE = 'parse',
  PLAN = 'plan',
  VALIDATE = 'validate',
}

export const PlanOrchestrator = {
  async run(path: string, destroyPlugins = true): Promise<PlanOchestratorResponse> {
    ctx.processStarted(PlanStatus.PLAN)

    ctx.subprocessStarted(PlanStatus.PARSE, PlanStatus.PLAN);
    const project = await Parser.parseProject(path);
    ctx.subprocessFinished(PlanStatus.PARSE, PlanStatus.PLAN);

    ctx.subprocessStarted(PlanStatus.INITIALIZE_PLUGINS, PlanStatus.PLAN)
    const pluginCollection = new PluginCollection();
    const dependencyMap = await pluginCollection.initialize(project);
    ctx.subprocessFinished(PlanStatus.INITIALIZE_PLUGINS, PlanStatus.PLAN)

    ctx.subprocessStarted(PlanStatus.VALIDATE, PlanStatus.PLAN)
    project.validateWithResourceMap(dependencyMap);
    project.resolveResourceDependencies(dependencyMap);

    const validationResults = await pluginCollection.validate(project);
    project.handlePluginResourceValidationResults(validationResults);
    project.calculateEvaluationOrder();
    ctx.subprocessFinished(PlanStatus.VALIDATE, PlanStatus.PLAN)


    ctx.subprocessStarted(PlanStatus.GENERATE_PLAN, PlanStatus.PLAN)
    const plan = await pluginCollection.getPlan(project);
    ctx.subprocessFinished(PlanStatus.GENERATE_PLAN, PlanStatus.PLAN)


    if (destroyPlugins) {
      await pluginCollection.destroy();
    }

    ctx.processFinished(PlanStatus.PLAN)

    return {
      plan,
      pluginCollection,
      project,
    };
  },
};
