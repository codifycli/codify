import { ResolvedParameter } from '../common/resolve-missing-parameters.js';
import { ApplyResult } from '../entities/apply-result.js';
import { Plan } from '../entities/plan.js';
import { ProcessName, ctx } from '../events/context.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { DefaultReporter } from '../ui/reporters/default-reporter.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { SleepInhibitor } from '../utils/sleep-inhibitor.js';
import { VerbosityLevel } from '../utils/verbosity-level.js';
import { PlanOrchestrator } from './plan.js';
import type { ResolvedVariable } from '../variables/variable-resolver.js';

export interface ApplyArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
  noProgress?: boolean;
  autoApprove?: boolean;
  // Also approve commands (actions) that come from templates (--auto-approve-all)
  autoApproveAll?: boolean;
  allowSleep?: boolean;
  presetParameterValues?: ResolvedParameter[];
  // Values for variables (--var). Used instead of asking.
  variableValues?: ResolvedVariable[];
}

export type ApplyOutcome =
  | { pluginManager: PluginManager; plan: Plan; result: ApplyResult; status: 'applied'; }
  | { pluginManager: PluginManager; plan: Plan; status: 'declined' | 'no-changes'; };

export const ApplyOrchestrator = {
  /**
   * Plan, ask for confirmation, then apply. Returns instead of exiting so that long-lived callers (`codify prompt`)
   * can continue; the `apply` command maps the outcome to exit codes. Plugin processes are left running: callers
   * that don't exit should call `outcome.pluginManager.dispose()`.
   */
  async run(args: ApplyArgs, reporter: Reporter): Promise<ApplyOutcome> {
    const planResult = await PlanOrchestrator.run({
      ...args,
      autoApproveTemplateCommands: args.autoApproveAll,
    }, reporter);

    // Short circuit if every change is NOOP
    if (planResult.plan.isEmpty()) {
      return { status: 'no-changes', plan: planResult.plan, pluginManager: planResult.pluginManager };
    }

    if (!args.autoApprove && !args.autoApproveAll) {
      const confirm = await reporter.promptConfirmation('Do you want to continue?')
      if (!confirm) {
        return { status: 'declined', plan: planResult.plan, pluginManager: planResult.pluginManager };
      }
    }

    const { plan, pluginManager, project } = planResult;
    const filteredPlan = plan.filterNoopResources()

    let currentVerbosity = args.verbosityLevel ?? 0;
    if (reporter instanceof DefaultReporter) {
      reporter.onVerbosityToggle(async () => {
        currentVerbosity = currentVerbosity === 0 ? 3 : 0;
        await pluginManager.setVerbosityLevel(currentVerbosity);
      });
    }

    const inhibitor = args.allowSleep ? null : SleepInhibitor.start();
    if (inhibitor && reporter instanceof DefaultReporter) {
      reporter.setSleepPrevented(true);
    }

    try {
      if (!args.noProgress) ctx.processStarted(ProcessName.APPLY);
      if (!args.noProgress) await reporter.displayProgress();

      const applyResult = await pluginManager.apply(project, filteredPlan);

      if (!args.noProgress) ctx.processFinished(ProcessName.APPLY);

      await reporter.displayApplyComplete(applyResult);

      return { status: 'applied', plan, result: applyResult, pluginManager };
    } finally {
      inhibitor?.stop();
    }

  },
};
