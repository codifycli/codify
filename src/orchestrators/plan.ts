import { PlanResponseData } from 'codify-schemas';

import { Project } from '../entities/project.js';
import { Parser } from '../parser/index.js';
import { PluginCollection } from '../plugins/plugin-collection.js';

interface PlanOchestratorResponse {
  plan: PlanResponseData[],
  pluginCollection: PluginCollection;
  project: Project;
}

export const PlanOrchestrator = {
  async run(path: string, destroyPlugins = true): Promise<PlanOchestratorResponse> {
    const project = await Parser.parseProject(path);

    const pluginCollection = new PluginCollection();
    const dependencyMap = await pluginCollection.initialize(project);
    project.validateWithResourceMap(dependencyMap);
    project.resolveResourceDependencies(dependencyMap);

    const validationResults = await pluginCollection.validate(project);
    project.handlePluginResourceValidationResults(validationResults);
    project.calculateEvaluationOrder();

    const plan = await pluginCollection.getPlan(project);
    console.log(JSON.stringify(plan, null, 2));

    if (destroyPlugins) {
      await pluginCollection.destroy();
    }

    return {
      plan,
      pluginCollection,
      project,
    };
  },
};
