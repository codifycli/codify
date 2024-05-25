import { Project } from '../entities/project.js';
import { ctx, SubProcessName } from '../events/context.js';
import { DependencyMap, PluginCollection } from '../plugins/plugin-collection.js';

export const CommonOrchestrator = {
  async initializePlugins(project?: Project): Promise<{
    dependencyMap: DependencyMap
    pluginCollection: PluginCollection,
  }> {
    ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginCollection = new PluginCollection();
    const dependencyMap = await pluginCollection.initialize(project);
    ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    return { dependencyMap, pluginCollection };
  }
};
