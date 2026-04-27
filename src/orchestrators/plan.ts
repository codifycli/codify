import { Config } from '@codifycli/schemas';

import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { OsUtils } from '../utils/os-utils.js';
import { ValidateOrchestrator } from './validate.js';

export interface PlanArgs {
  path?: string;
  secureMode?: boolean;
  verbosityLevel?: number;
  codifyConfigs?: Config[];
  noProgress?: boolean;
}

export interface PlanOrchestratorResponse {
  plan: Plan,
  pluginManager: PluginManager;
  project: Project;
}

export class PlanOrchestrator {
  static async run(args: PlanArgs, reporter: Reporter): Promise<PlanOrchestratorResponse> {
    if (!args.noProgress) ctx.processStarted(ProcessName.PLAN);

    const initializationResult = await PluginInitOrchestrator.run({
      ...args,
    }, reporter);
    const { resourceDefinitions, pluginManager, project } = initializationResult;

    await createStartupShellScriptsIfNotExists();

    await ValidateOrchestrator.run({ existing: initializationResult, noProgress: args.noProgress }, reporter);
    project.resolveDependenciesAndCalculateEvalOrder(resourceDefinitions);
    if (OsUtils.isMacOS()) {
      project.addXCodeToolsConfig(); // We have to add xcode-tools config always to MacOS since almost every resource depends on it
    }

    const plan = await PlanOrchestrator.plan(project, pluginManager, args.noProgress);
    plan.sortByEvalOrder(project.evaluationOrder);
    project.removeNoopFromEvaluationOrder(plan);

    if (!args.noProgress) ctx.processFinished(ProcessName.PLAN)

    await reporter.hide();
    await reporter.displayPlan(plan);

    return {
      plan,
      pluginManager,
      project,
    };
  }

  private static async plan(project: Project, pluginManager: PluginManager, silent?: boolean): Promise<Plan> {
    if (!silent) ctx.subprocessStarted(SubProcessName.GENERATE_PLAN)
    const plan = await pluginManager.plan(project);
    if (!silent) ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    return plan;
  }
}
