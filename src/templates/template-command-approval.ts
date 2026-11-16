import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TemplateCommandsDeclinedError } from '../common/errors.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';

/**
 * Resource types that run arbitrary commands. When they come from a template the user has to approve the commands
 * before anything runs. Note that the `condition` of an action runs during the plan, so this happens before planning.
 */
export const COMMAND_RESOURCE_TYPES = new Set(['action']);

// The parameters of an action that are shown to the user (in this order)
const DISPLAYED_PARAMETERS = ['condition', 'action', 'cwd', 'requiresRoot', 'requiresStdin'];

export interface TemplateCommandApprovalRequest {
  resourceId: string;
  // Where the resource came from, one entry per origin. Ex: ['@codify/node > nvm']
  templates: string[];
  parameters: Array<{ name: string; value: unknown }>;
}

export interface ApprovalArgs {
  // Approve every template command without prompting (--auto-approve-all)
  autoApproveAll?: boolean;
  // Override where approvals are remembered. Defaults to ~/.codify/approved-template-commands.json
  storePath?: string;
}

interface ApprovalStoreFile {
  version: 1;
  approvals: Record<string, { approvedAt: string; resourceId: string; templates: string[] }>;
}

export const TemplateCommandApproval = {
  defaultStorePath(): string {
    return path.join(os.homedir(), '.codify', 'approved-template-commands.json');
  },

  /**
   * Makes sure the user approved every command coming from a template. Commands that were approved before (same
   * templates and exactly the same parameters) are not asked again.
   *
   * @throws TemplateCommandsDeclinedError if the user declines. The whole run is stopped.
   */
  async ensureApproved(project: Project, reporter: Reporter, args: ApprovalArgs = {}): Promise<void> {
    const resources = TemplateCommandApproval.resourcesRequiringApproval(project);
    if (resources.length === 0) {
      return;
    }

    if (args.autoApproveAll) {
      ctx.log(`Auto approving ${resources.length} command(s) from templates (--auto-approve-all): ${resources.map((r) => r.id).join(', ')}`);
      return;
    }

    const storePath = args.storePath ?? TemplateCommandApproval.defaultStorePath();
    const store = await readStore(storePath);
    const unapproved = resources.filter((r) => !store.approvals[approvalKey(r)]);
    if (unapproved.length === 0) {
      return;
    }

    const requests = unapproved.map((r) => TemplateCommandApproval.toRequest(r));
    const approved = await reporter.promptTemplateCommandApproval(requests);
    if (!approved) {
      throw new TemplateCommandsDeclinedError();
    }

    for (const [idx, resource] of unapproved.entries()) {
      store.approvals[approvalKey(resource)] = {
        approvedAt: new Date().toISOString(),
        resourceId: resource.id,
        templates: requests[idx].templates,
      };
    }

    await writeStore(storePath, store);
  },

  /** Command resources that were only declared in templates. A command the user declared themselves is not asked. */
  resourcesRequiringApproval(project: Project): ResourceConfig[] {
    return project.resourceConfigs.filter((r) => COMMAND_RESOURCE_TYPES.has(r.type) && r.isFromTemplatesOnly);
  },

  toRequest(resource: ResourceConfig): TemplateCommandApprovalRequest {
    const extraParameters = Object.keys(resource.parameters).filter((k) => !DISPLAYED_PARAMETERS.includes(k)).sort();

    return {
      resourceId: resource.id,
      templates: resource.origins.map((o) => o.templates.map((t) => t.source).join(' > ')),
      parameters: [...DISPLAYED_PARAMETERS, ...extraParameters]
        .filter((name) => resource.parameters[name] !== undefined)
        .map((name) => ({ name, value: resource.parameters[name] })),
    };
  },
}

/**
 * Hash of the templates a command came from and the full command. Any change to the template source or the command
 * requires a new approval.
 */
function approvalKey(resource: ResourceConfig): string {
  const templates = [...new Set(resource.origins.map((o) => o.templates.map((t) => t.sourceKey).join('>')))].sort();
  const payload = stableStringify({ templates, type: resource.type, parameters: resource.parameters });
  return createHash('sha256').update(payload).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

async function readStore(storePath: string): Promise<ApprovalStoreFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath, 'utf8')) as ApprovalStoreFile;
    if (parsed?.version === 1 && parsed.approvals && typeof parsed.approvals === 'object') {
      return parsed;
    }
  } catch {
    // Missing or unreadable store: nothing is approved yet
  }

  return { version: 1, approvals: {} };
}

async function writeStore(storePath: string, store: ApprovalStoreFile): Promise<void> {
  try {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    // Not remembering an approval only means the user is asked again next time
    ctx.debug(`Unable to save template command approvals to ${storePath}: ${error}`);
  }
}
