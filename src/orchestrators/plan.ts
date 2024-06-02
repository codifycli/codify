import { PlanResponseData } from 'codify-schemas';

import { Project } from '../entities/project.js';
import { ctx, ProcessName, SubProcessName } from '../events/context.js';
import { Parser } from '../parser/index.js';
import { PluginCollection } from '../plugins/plugin-collection.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { CommonOrchestrator } from '../common/orchestrator.js';

export interface PlanOrchestratorResponse {
  plan: PlanResponseData[],
  pluginCollection: PluginCollection;
  project: Project;
}

export const PlanOrchestrator = {
  async run(path: string, secureMode: boolean): Promise<PlanOrchestratorResponse> {
    ctx.processStarted(ProcessName.PLAN)

    ctx.subprocessStarted(SubProcessName.PARSE);
    const project = await Parser.parseProject(path);

    // Always add xcode tools as a dependency to make sure it's installed. This may be temporary if required dependencies get added.
    project.addXCodeToolsConfig();
    ctx.subprocessFinished(SubProcessName.PARSE);

    const { dependencyMap, pluginCollection } = await CommonOrchestrator.initializePlugins(project, secureMode);
    await createStartupShellScriptsIfNotExists();

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

    ctx.processFinished(ProcessName.PLAN)

    return {
      plan,
      pluginCollection,
      project,
    };
  },
};
