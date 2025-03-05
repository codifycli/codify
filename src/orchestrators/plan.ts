import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { PluginInitOrchestrator } from './initialize-plugins.js';
import { ValidateOrchestrator } from './validate.js';

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

    const initializationResult = await PluginInitOrchestrator.run({
      ...args,
    }, reporter);
    const { typeIdsToDependenciesMap, pluginManager, project } = initializationResult;

    await createStartupShellScriptsIfNotExists();

    await ValidateOrchestrator.run({ existing: initializationResult }, reporter);
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

  private static async plan(project: Project, pluginManager: PluginManager): Promise<Plan> {
    ctx.subprocessStarted(SubProcessName.GENERATE_PLAN)
    const plan = await pluginManager.plan(project);
    ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    return plan;
  }
}
