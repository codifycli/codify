import { Config } from '@codifycli/schemas';

import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { MissingParametersResolver, ResolvedParameter } from '../common/resolve-missing-parameters.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { TemplateCommandApproval } from '../templates/template-command-approval.js';
import { MergeWarning } from '../templates/template-resource-merger.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { OsUtils } from '../utils/os-utils.js';
import { ValidateOrchestrator } from './validate.js';
import type { ResolvedVariable } from '../variables/variable-resolver.js';

export interface PlanArgs {
  path?: string;
  secureMode?: boolean;
  verbosityLevel?: number;
  codifyConfigs?: Config[];
  noProgress?: boolean;
  // Approve commands (actions) that come from templates without prompting
  autoApproveTemplateCommands?: boolean;
  /** Values to use instead of prompting for missing values (ex: forwarded by `codify test`) */
  presetParameterValues?: ResolvedParameter[];
  // Values for variables (--var). Used instead of asking.
  variableValues?: ResolvedVariable[];
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
      allowTemplates: true,
      expandTemplates: true,
    }, reporter);
    const { resourceDefinitions, pluginManager, project, templateMergeWarnings } = initializationResult;

    await createStartupShellScriptsIfNotExists();

    // Prompt for missing required values and dashboard placeholders. Must happen before validation.
    await MissingParametersResolver.run(initializationResult, reporter, args.presetParameterValues);
    await ValidateOrchestrator.run({ existing: initializationResult, noProgress: args.noProgress }, reporter);
    project.resolveDependenciesAndCalculateEvalOrder(resourceDefinitions);
    if (OsUtils.isMacOS()) {
      project.addXCodeToolsConfig(); // We have to add xcode-tools config always to MacOS since almost every resource depends on it
    }

    // Must happen before planning: the condition of an action runs during the plan
    await TemplateCommandApproval.ensureApproved(project, reporter, { autoApproveAll: args.autoApproveTemplateCommands });

    const plan = await PlanOrchestrator.plan(project, pluginManager, args.noProgress);
    plan.warnings = [
      ...PlanOrchestrator.implicitVariablesWarning(project),
      ...templateMergeWarnings.map((w) => PlanOrchestrator.formatMergeWarning(w)),
    ];
    PlanOrchestrator.markSensitiveVariables(plan, project);
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

  static implicitVariablesWarning(project: Project): string[] {
    if (project.implicitVariables.length === 0) {
      return [];
    }

    const names = project.implicitVariables.map((n) => `"${n}"`).join(', ');
    return [`${names} ${project.implicitVariables.length === 1 ? 'is' : 'are'} used but not declared. Declare ${project.implicitVariables.length === 1 ? 'it' : 'them'} with a variable block ({ "type": "variable", "name": "..." }) to add a type, a default and a description.`];
  }

  /** Values that come from sensitive variables are shown as [Sensitive] */
  static markSensitiveVariables(plan: Plan, project: Project): void {
    for (const resource of project.resourceConfigs) {
      if (resource.sensitiveParameterKeys.size === 0) {
        continue;
      }

      for (const parameter of plan.getResourcePlan(resource.id)?.parameters ?? []) {
        if (resource.sensitiveParameterKeys.has(parameter.name)) {
          parameter.isSensitive = true;
        }
      }
    }
  }

  static formatMergeWarning(warning: MergeWarning): string {
    const format = (value: unknown) => JSON.stringify(value);
    return `${warning.resourceId}: "${warning.parameter}" is declared with different values. Using ${format(warning.keptValue)} and ignoring ${format(warning.droppedValue)} (from a template).`;
  }

  private static async plan(project: Project, pluginManager: PluginManager, silent?: boolean): Promise<Plan> {
    if (!silent) ctx.subprocessStarted(SubProcessName.GENERATE_PLAN)
    const plan = await pluginManager.plan(project);
    if (!silent) ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    return plan;
  }
}
