import { ResolvedParameter } from '../common/resolve-missing-parameters.js';
import { ApplyResult } from '../entities/apply-result.js';
import { Plan } from '../entities/plan.js';
import { ProcessName, ctx } from '../events/context.js';
import { type Notice, NoticeEvaluator } from '../notices/notice-evaluator.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { DefaultReporter } from '../ui/reporters/default-reporter.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { SleepInhibitor } from '../utils/sleep-inhibitor.js';
import { VerbosityLevel } from '../utils/verbosity-level.js';
import { PlanOrchestrator } from './plan.js';
import { templateUsage } from '../templates/template-usage.js';
import type { TargetKind } from '../parser/resolver.js';
import type { ResolvedVariable } from '../variables/variable-resolver.js';

export interface ApplyArgs {
  path?: string;
  // The arguments of the command: one file, one template or resource types. Used instead of path.
  targets?: string[];
  // --resource / --template: how every target is read. Detected otherwise.
  targetKind?: TargetKind;
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
  // The dashboard document being run and the saved secrets approved on the dashboard (codify connect)
  documentId?: string;
  approvedSecrets?: string[];
  // False for configs written by the Codify agent: they can't use saved variables or secrets
  allowSavedValues?: boolean;
}

export type ApplyOutcome =
  | { pluginManager: PluginManager; plan: Plan; result: ApplyResult; status: 'applied'; }
  // Notices with show: always. Shown by the caller (after its own "no changes" message).
  | { notices: Notice[]; pluginManager: PluginManager; plan: Plan; status: 'no-changes'; }
  | { pluginManager: PluginManager; plan: Plan; status: 'declined'; };

export const ApplyOrchestrator = {
  /**
   * Plan, ask for confirmation, then apply. Returns instead of exiting so that long-lived callers (`codify prompt`)
   * can continue; the `apply` command maps the outcome to exit codes. Plugin processes are left running: callers
   * that don't exit should call `outcome.pluginManager.dispose()`.
   */
  async run(args: ApplyArgs, reporter: Reporter): Promise<ApplyOutcome> {
    // Registry templates loaded while planning are recorded here; their apply result is reported at the end.
    templateUsage.reset();
    const planResult = await PlanOrchestrator.run({
      ...args,
      autoApproveTemplateCommands: args.autoApproveAll,
    }, reporter);

    // Short circuit if every change is NOOP
    if (planResult.plan.isEmpty()) {
      // Everything in the templates is already on the machine: that counts as a successful apply
      await reportTemplateResult(true);
      return {
        status: 'no-changes',
        plan: planResult.plan,
        pluginManager: planResult.pluginManager,
        notices: NoticeEvaluator.forApply(planResult.project),
      };
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

    let succeeded = false;
    try {
      if (!args.noProgress) ctx.processStarted(ProcessName.APPLY);
      if (!args.noProgress) await reporter.displayProgress();

      const applyResult = await pluginManager.apply(project, filteredPlan);
      succeeded = applyResult.errors.length === 0;

      if (!args.noProgress) ctx.processFinished(ProcessName.APPLY);

      applyResult.notices = NoticeEvaluator.forApply(project, applyResult);
      await reporter.displayApplyComplete(applyResult);

      return { status: 'applied', plan, result: applyResult, pluginManager };
    } finally {
      await reportTemplateResult(succeeded);
      inhibitor?.stop();
    }

  },
};

/** Tells the registry how applying its templates went (see TemplateUsage). Nothing is sent without templates. */
async function reportTemplateResult(succeeded: boolean): Promise<void> {
  const templates = templateUsage.list();
  if (templates.length === 0) return;
  await templateUsage.report('apply_started', templates);
  await templateUsage.report(succeeded ? 'apply_succeeded' : 'apply_failed', templates);
}
