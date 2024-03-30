import { ConfigCompiler } from '../../config-compiler/index.js';
import { PluginCollection } from '../../plugins/plugin-collection.js';

export const PlanOrchestrator = {
  async run(rootDirectory: string): Promise<string> {
    const project = await ConfigCompiler.parseProject(rootDirectory);

    const pluginCollection = new PluginCollection();
    const dependencyMap = await pluginCollection.initialize(project);
    project.validateWithResourceMap(dependencyMap);
    project.resolveResourceDependencies(dependencyMap);

    await pluginCollection.validate(project);
    project.calculateEvaluationOrder();

    const plan = await pluginCollection.getPlan(project);
    console.log(JSON.stringify(plan, null, 2));

    await pluginCollection.destroy();

    return '';
  },
};
