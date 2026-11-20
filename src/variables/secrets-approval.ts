import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SecretsDeclinedError } from '../common/errors.js';
import { ctx } from '../events/context.js';
import type { Reporter } from '../ui/reporters/reporter.js';

/** A saved secret a run is about to use, and where it is used. Passed to {@link Reporter.promptSecretsApproval}. */
export interface SecretsApprovalRequest {
  // Ex: secrets.user.GITHUB_TOKEN
  key: string;
  // Ex: personal secret
  description: string;
  // Ex: ['git-repository', 'template @acme/deploy (token)']
  usedBy: string[];
}

export interface SecretsApprovalArgs {
  // Identifies the config being run (file path or dashboard document). Approvals are remembered per config.
  configKey: string;
  // Secrets already approved on the dashboard for this run. They are not asked again.
  approvedSecrets?: string[];
  // Approve without asking (--auto-approve-all)
  autoApproveAll?: boolean;
  // Override where approvals are remembered. Defaults to ~/.codify/approved-secrets.json
  storePath?: string;
}

interface ApprovalStoreFile {
  version: 1;
  approvals: Record<string, { approvedAt: string; configKey: string; secrets: string[] }>;
}

/**
 * Saved secrets are only used after the user approved them: on the dashboard (the run sends the approved keys) or in
 * the CLI. Approvals are remembered per config until the secrets or where they are used change.
 *
 * @throws SecretsDeclinedError if the user declines. The whole run is stopped.
 */
export const SecretsApproval = {
  defaultStorePath(): string {
    return path.join(os.homedir(), '.codify', 'approved-secrets.json');
  },

  async ensureApproved(requests: SecretsApprovalRequest[], reporter: Reporter, args: SecretsApprovalArgs): Promise<void> {
    const approvedOnDashboard = new Set(args.approvedSecrets ?? []);
    const unapproved = requests.filter((r) => !approvedOnDashboard.has(r.key));
    if (unapproved.length === 0) {
      return;
    }

    if (args.autoApproveAll) {
      ctx.log(`Auto approving ${unapproved.length} secret(s) (--auto-approve-all): ${unapproved.map((r) => r.key).join(', ')}`);
      return;
    }

    const storePath = args.storePath ?? SecretsApproval.defaultStorePath();
    const store = await readStore(storePath);
    const key = approvalKey(args.configKey, unapproved);
    if (store.approvals[key]) {
      return;
    }

    const approved = await reporter.promptSecretsApproval(unapproved);
    if (!approved) {
      throw new SecretsDeclinedError();
    }

    store.approvals[key] = {
      approvedAt: new Date().toISOString(),
      configKey: args.configKey,
      secrets: unapproved.map((r) => r.key),
    };
    await writeStore(storePath, store);
  },
};

function approvalKey(configKey: string, requests: SecretsApprovalRequest[]): string {
  const secrets = requests
    .map((r) => `${r.key}=>${[...r.usedBy].sort().join(',')}`)
    .sort();
  return createHash('sha256').update(JSON.stringify({ configKey, secrets })).digest('hex');
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
    ctx.debug(`Unable to save secret approvals to ${storePath}: ${error}`);
  }
}
