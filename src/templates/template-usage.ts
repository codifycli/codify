import type { RegistryTemplate } from '../api/dashboard/types.js';

import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { ctx } from '../events/context.js';

export type UsedTemplate = {
  fullName: string;
  id: string;
  version?: string;
  versionId?: string;
};

export type TemplateUsageKind = 'apply_failed' | 'apply_started' | 'apply_succeeded';

const REPORT_TIMEOUT_MS = 3000;

function isSet(name: string): boolean {
  return ['1', 'true', 'yes'].includes((process.env[name] ?? '').toLowerCase());
}

/**
 * Registry templates applied in this run, and the apply results sent back to the registry. The counts power the
 * Marketplace ranking, the "applies succeed" rate and "Verified apply" on reviews.
 *
 * Only the template, its version and the result are sent (with the user's login when logged in, so they can review
 * the template). Nothing about the machine or the config. Turned off with DO_NOT_TRACK=1 or
 * CODIFY_DISABLE_TEMPLATE_STATS=1. Dashboard documents used as templates are never reported.
 */
export class TemplateUsage {
  static get enabled(): boolean {
    return !isSet('DO_NOT_TRACK') && !isSet('CODIFY_DISABLE_TEMPLATE_STATS') && !process.env.VITEST;
  }

  private readonly used = new Map<string, UsedTemplate>();

  constructor(private readonly fetchImpl: typeof fetch = async (input, init) => fetch(input, init)) {}

  list(): UsedTemplate[] {
    // eslint-disable-next-line unicorn/prefer-iterator-to-array -- Iterator#toArray isn't in this TypeScript lib
    return [...this.used.values()];
  }

  /** Called by the template loader for every registry template it loads. */
  record(template: RegistryTemplate): void {
    if (!template.id) return;
    this.used.set(`${template.id}@${template.version ?? ''}`, {
      fullName: template.fullName ?? template.name,
      id: template.id,
      version: template.version ?? undefined,
      versionId: template.versionId ?? undefined,
    });
  }

  /** Sends one event per template. Never throws and gives up after a few seconds. */
  async report(kind: TemplateUsageKind, templates: UsedTemplate[] = this.list(), isEnabled = TemplateUsage.enabled): Promise<void> {
    if (!isEnabled || templates.length === 0) return;

    const token = LoginHelper.get()?.isLoggedIn ? LoginHelper.get()?.credentials?.accessToken : undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REPORT_TIMEOUT_MS);

    try {
      await Promise.all(templates.map(async (t) => {
        const response = await this.fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/record_template_event`, {
          body: JSON.stringify({
            p_kind: kind,
            p_surface: 'cli',
            p_template_id: t.id,
            p_version_id: t.versionId ?? null,
          }),
          headers: {
            apikey: config.supabasePublishableKey,
            authorization: `Bearer ${token ?? config.supabasePublishableKey}`,
            'content-type': 'application/json',
          },
          method: 'POST',
          signal: controller.signal,
        });
        if (!response.ok) {
          ctx.debug(`Template stats: ${t.fullName} ${kind} failed (${response.status})`);
        }
      }));
    } catch (error) {
      ctx.debug(`Template stats not sent: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Forget the templates of the previous run (the CLI can be long running: codify connect, codify prompt). */
  reset(): void {
    this.used.clear();
  }
}

/** The tracker of this process. */
export const templateUsage = new TemplateUsage();
