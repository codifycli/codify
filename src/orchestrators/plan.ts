import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { InitializeOrchestrator } from './initialize.js';

export interface PlanArgs {
  path?: string;
  secureMode?: boolean;
}

export interface PlanOrchestratorResponse {
  plan: Plan,
  pluginManager: PluginManager;
  project: Project;
}

export class PlanOrchestrator {
  static async run(args: PlanArgs, reporter: Reporter): Promise<PlanOrchestratorResponse> {
    ctx.processStarted(ProcessName.PLAN)

    const { typeIdsToDependenciesMap, pluginManager, project } = await InitializeOrchestrator.run({
      ...args,
    }, reporter);

    await createStartupShellScriptsIfNotExists();

    await PlanOrchestrator.validate(project, pluginManager, typeIdsToDependenciesMap)
    project.resolveDependenciesAndCalculateEvalOrder(typeIdsToDependenciesMap);
    project.addXCodeToolsConfig(); // We have to add xcode-tools config always since almost every resource depends on it

    const plan = await PlanOrchestrator.plan(project, pluginManager);
    plan.sortByEvalOrder(project.evaluationOrder);
    project.removeNoopFromEvaluationOrder(plan);

    ctx.processFinished(ProcessName.PLAN)

    reporter.displayPlan(plan);

    return {
      plan,
      pluginManager,
      project,
    };
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
    const plan = await pluginManager.plan(project);
    ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    return plan;
  }
}
