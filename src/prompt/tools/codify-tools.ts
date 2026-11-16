import { ResourceOperation } from '@codifycli/schemas';
import stripAnsi from 'strip-ansi';

import { ResourceMissingParameters } from '../../entities/missing-parameter.js';
import { Plan } from '../../entities/plan.js';
import { ApplyOrchestrator } from '../../orchestrators/apply.js';
import { PlanOrchestrator } from '../../orchestrators/plan.js';
import { applyEntryLabel } from '../../ui/apply-result-formatter.js';
import { prettyFormatResourcePlan } from '../../ui/plan-pretty-printer.js';
import { Reporter } from '../../ui/reporters/reporter.js';
import { StubReporter } from '../../ui/reporters/stub-reporter.js';
import { SessionStore } from '../session-store.js';

export interface PlannedResource {
  id: string;
  operation: string;
  details: string;
}

export interface CodifyPlanResult {
  status: 'changes' | 'error' | 'no-changes';
  configPath: string;
  resources?: PlannedResource[];
  error?: string;
}

export interface CodifyApplyResult {
  status: 'applied' | 'declined' | 'error' | 'no-changes';
  configPath: string;
  resources?: Array<{ error?: string; id: string; result: string; }>;
  error?: string;
}

/**
 * Plans for the agent's own checks run without UI: anything that would need the user (missing required values)
 * fails and is reported back to the agent to fix.
 */
class NonInteractiveReporter extends StubReporter {
  async promptMissingParameters(requests: ResourceMissingParameters[]): Promise<unknown[][]> {
    const missing = requests.map((r) => `${r.resource.id}: ${r.parameters.map((p) => p.label).join(', ')}`);
    throw new Error(`The config is missing required values (${missing.join('; ')}). Fill them in or ask the user.`);
  }
}

export async function codifyPlanTool(args: { config: string }, options: { threadId: string }): Promise<CodifyPlanResult> {
  const configPath = await SessionStore.writeConfig(options.threadId, args.config);

  let pluginManager;
  try {
    const result = await PlanOrchestrator.run({ path: configPath, noProgress: true }, new NonInteractiveReporter());
    pluginManager = result.pluginManager;

    const resources = summarizePlan(result.plan);
    return resources.length === 0
      ? { status: 'no-changes', configPath }
      : { status: 'changes', configPath, resources };
  } catch (error) {
    return { status: 'error', configPath, error: errorMessage(error) };
  } finally {
    pluginManager?.dispose();
  }
}

export async function codifyApplyTool(
  args: { config: string },
  options: { reporter: Reporter; threadId: string },
): Promise<CodifyApplyResult> {
  const configPath = await SessionStore.writeConfig(options.threadId, args.config);

  let outcome;
  try {
    outcome = await ApplyOrchestrator.run({ path: configPath }, options.reporter);
  } catch (error) {
    await options.reporter.hide();
    return { status: 'error', configPath, error: errorMessage(error) };
  }

  try {
    if (outcome.status !== 'applied') {
      return { status: outcome.status, configPath };
    }

    return {
      status: 'applied',
      configPath,
      resources: outcome.result.entries.map((entry) => ({
        id: entry.id,
        result: applyEntryLabel(entry),
        ...(entry.error ? { error: errorMessage(entry.error) } : {}),
      })),
    };
  } finally {
    outcome.pluginManager.dispose();
    await options.reporter.hide();
  }
}

function summarizePlan(plan: Plan): PlannedResource[] {
  return plan.resources
    .filter((r) => r.operation !== ResourceOperation.NOOP)
    .map((r) => ({
      id: r.id,
      operation: r.operation,
      details: stripAnsi(prettyFormatResourcePlan(r)),
    }));
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return stripAnsi(message).slice(0, 4000);
}
