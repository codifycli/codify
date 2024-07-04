import { CommonOrchestrator } from '../common/orchestrator.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ctx, ProcessName, SubProcessName } from '../events/context.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { CodifyParser } from '../parser/index.js';

export interface PlanOrchestratorResponse {
  plan: Plan,
  pluginManager: PluginManager;
  project: Project;
}

export class PlanOrchestrator {
  static async run(path: string, secureMode: boolean): Promise<PlanOrchestratorResponse> {
    ctx.processStarted(ProcessName.PLAN)

    const project = await PlanOrchestrator.parse(path)

    const { dependencyMap, pluginManager } = await CommonOrchestrator.initializePlugins(project, secureMode);
    await createStartupShellScriptsIfNotExists();

    await PlanOrchestrator.validate(project, pluginManager, dependencyMap)

    project.resolveResourceDependencies(dependencyMap);
    project.calculateEvaluationOrder();

    const plan = await PlanOrchestrator.plan(project, pluginManager)

    ctx.processFinished(ProcessName.PLAN)

    return {
      plan,
      pluginManager,
      project,
    };
  }

  private static async parse(path: string): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);
    const project = await CodifyParser.parse(path);

    // Always add xcode tools as a dependency to make sure it's installed. This may be temporary if required dependencies get added.
    project.addXCodeToolsConfig();
    ctx.subprocessFinished(SubProcessName.PARSE);

    return project
  }

  private static async validate(project: Project, pluginManager: PluginManager, dependencyMap: DependencyMap) {
    ctx.subprocessStarted(SubProcessName.VALIDATE)

    project.validateTypeIds(dependencyMap);
    const validationResults = await pluginManager.validate(project);
    project.handlePluginResourceValidationResults(validationResults);

    ctx.subprocessFinished(SubProcessName.VALIDATE)
  }

  private static async plan(project: Project, pluginManager: PluginManager): Promise<Plan> {
    ctx.subprocessStarted(SubProcessName.GENERATE_PLAN)
    const plan = await pluginManager.getPlan(project);
    ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    return plan;
  }
}
