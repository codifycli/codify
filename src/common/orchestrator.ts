import { Project } from '../entities/project.js';
import { SubProcessName, ctx } from '../events/context.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';

export const CommonOrchestrator = {
  async initializePlugins(project: Project | null, secureMode = false): Promise<{
    dependencyMap: DependencyMap
    pluginManager: PluginManager,
  }> {
    ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginManager = new PluginManager();
    const dependencyMap = await pluginManager.initialize(project, secureMode);
    ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    return { dependencyMap, pluginManager };
  },
};
