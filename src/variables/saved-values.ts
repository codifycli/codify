import { SavedValuesClient } from '../api/saved-values/index.js';
import { VariableError } from '../common/errors.js';
import type { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { VariableConfig } from '../entities/variable-config.js';
import type { Reporter } from '../ui/reporters/reporter.js';
import { SecretRedactor } from '../utils/secret-redactor.js';
import { type SavedReference, describeSavedReference, isSavedKey, parseSavedKey } from './saved-references.js';
import { SecretsApproval } from './secrets-approval.js';
import { findReferences } from './substitution.js';
import type { ResolvedVariable } from './variable-resolver.js';

/** What the VariableResolver needs to know about the saved references of the project file */
export interface SavedValues {
  // Values that were found, as preset values of the project file (scope [] and the key as the name)
  presets: ResolvedVariable[];
  // Keys of the references that are secrets (found or not): their values are sensitive
  sensitiveKeys: Set<string>;
  // Why a reference that wasn't found is asked (shown with the question)
  hints: Map<string, string>;
}

export interface SavedValuesOptions {
  // False for configs written by the Codify agent: they can't use saved values
  allowed: boolean;
  // The dashboard document being run (for secrets.file.*)
  documentId?: string;
  // Identifies the config being run. Approvals are remembered per config.
  configKey: string;
  // Values that are already known (--var, forwarded by codify test): they are not fetched
  presetKeys: Set<string>;
  approvedSecrets?: string[];
  autoApproveAll?: boolean;
  reporter: Reporter;
}

const EMPTY: SavedValues = { presets: [], sensitiveKeys: new Set(), hints: new Map() };

/**
 * Loads the saved variables and secrets referenced by the project file (${{ secrets.user.NAME }}, ...). Only the config
 * being run may reference them: templates get them through their `variables` (see VariableResolver).
 *
 *   1. References are fetched with the user's login (only what the user may use is returned).
 *   2. Saved secrets must be approved (on the dashboard or here) before they are used.
 *   3. References that are not found are asked like variables, with a hint (a likely typo, not logged in, ...).
 *
 * Secret values are registered with the SecretRedactor so they never appear in the output.
 */
export const SavedValuesLoader = {
  /** The saved references of the project file and where each one is used */
  findReferences(project: Project): Map<string, { reference: SavedReference; usedBy: Set<string> }> {
    const found = new Map<string, { reference: SavedReference; usedBy: Set<string> }>();
    const add = (value: unknown, usedBy: string) => {
      for (const key of findReferences(value)) {
        const reference = parseSavedKey(key);
        if (!reference) continue;

        const entry = found.get(key) ?? { reference, usedBy: new Set<string>() };
        entry.usedBy.add(usedBy);
        found.set(key, entry);
      }
    };

    for (const declaration of project.declarations) {
      if (declaration instanceof ResourceConfig) {
        add(declaration.parameters, declaration.id);
      } else if (declaration instanceof TemplateConfig) {
        for (const [name, value] of Object.entries(declaration.variables ?? {})) {
          add(value, `template ${declaration.source} (${name})`);
        }
      } else if (declaration instanceof VariableConfig) {
        add(declaration.default, `the default of variable ${declaration.name}`);
      }
    }

    return found;
  },

  async load(project: Project, options: SavedValuesOptions): Promise<SavedValues> {
    const references = SavedValuesLoader.findReferences(project);
    if (references.size === 0) {
      return EMPTY;
    }

    if (!options.allowed) {
      throw new VariableError(project.codifyFiles[0] ?? 'config', `Configs written by the Codify agent can't use saved variables or secrets: ${[...references.keys()].join(', ')}`);
    }

    const sensitiveKeys = new Set([...references.values()].filter((r) => r.reference.kind === 'secret').map((r) => r.reference.key));
    const toFetch = [...references.values()].filter((r) => !options.presetKeys.has(r.reference.key));
    if (toFetch.length === 0) {
      return { presets: [], sensitiveKeys, hints: new Map() };
    }

    const hints = new Map<string, string>();
    if (!SavedValuesClient.isLoggedIn) {
      for (const { reference } of toFetch) {
        hints.set(reference.key, `Not logged in: run "codify login" to use your saved ${describeSavedReference(reference)}, or enter a value for this run.`);
      }

      return { presets: [], sensitiveKeys, hints };
    }

    const { values, secretKeys } = await SavedValuesClient.resolve(toFetch.map((r) => r.reference), options.documentId);

    // Values that were not found are asked. A likely typo is pointed out.
    const missing = toFetch.filter((r) => !values.has(r.reference.key));
    if (missing.length > 0) {
      const knownKeys = await SavedValuesClient.listKeys().catch(() => []);
      for (const { reference } of missing) {
        hints.set(reference.key, missingHint(reference, knownKeys, Boolean(options.documentId)));
      }
    }

    const secretRequests = [...secretKeys].map((key) => ({
      key,
      description: describeSavedReference(parseSavedKey(key)!),
      usedBy: [...references.get(key)!.usedBy],
    }));
    if (secretRequests.length > 0) {
      await SecretsApproval.ensureApproved(secretRequests, options.reporter, {
        configKey: options.configKey,
        approvedSecrets: options.approvedSecrets,
        autoApproveAll: options.autoApproveAll,
      });
    }

    for (const key of secretKeys) {
      SecretRedactor.register(values.get(key)!);
    }

    return {
      presets: [...values.entries()].map(([name, value]) => ({ scope: [], name, value })),
      sensitiveKeys,
      hints,
    };
  },

  /** Keys of the preset values that are saved references (--var secrets.user.X=..., values forwarded to the VM) */
  presetKeys(presets: ResolvedVariable[]): Set<string> {
    return new Set(presets.filter((p) => p.scope.length === 0 && isSavedKey(p.name)).map((p) => p.name));
  },
};

function missingHint(reference: SavedReference, knownKeys: string[], hasDocument: boolean): string {
  const description = describeSavedReference(reference);
  const suggestion = closestKey(reference, knownKeys);
  const parts = [
    `No saved ${description} named ${reference.name}${suggestion ? `. Did you mean ${suggestion}?` : '.'}`,
  ];

  if (reference.scope === 'organization') {
    parts.push('An admin of your organization can add it.');
  } else if (reference.scope === 'document' && !hasDocument) {
    parts.push('File secrets can only be used when running a dashboard document.');
  }

  parts.push('Enter a value for this run, or press esc and add it in Settings › Variables & Secrets.');
  return parts.join(' ');
}

/** A known key that is probably what was meant: same kind, same name ignoring case or at most 2 edits away */
export function closestKey(reference: SavedReference, knownKeys: string[]): string | undefined {
  let best: { distance: number; key: string } | undefined;
  for (const key of knownKeys) {
    const known = parseSavedKey(key);
    if (!known || known.kind !== reference.kind || key === reference.key) continue;

    const distance = known.name.toLowerCase() === reference.name.toLowerCase()
      ? 0
      : levenshtein(known.name.toLowerCase(), reference.name.toLowerCase());
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { distance, key };
    }
  }

  return best?.key;
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    previous = current;
  }

  return previous[b.length];
}
