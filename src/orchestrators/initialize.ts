import { Project } from '../entities/project.js';
import { SubProcessName, ctx } from '../events/context.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';

export interface InitializationResult {
  dependencyMap: DependencyMap
  pluginManager: PluginManager,
}

export class InitializeOrchestrator {
  static async run(project: Project | null, secureMode = false): Promise<InitializationResult> {
    ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginManager = new PluginManager();
    const dependencyMap = await pluginManager.initialize(project, secureMode);
    ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    return { dependencyMap, pluginManager };
  }
}
