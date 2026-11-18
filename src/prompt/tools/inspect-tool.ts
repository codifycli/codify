import os from 'node:os';

import type { ResourceJson } from '@codifycli/schemas';
import { OS } from '@codifycli/schemas';

import { PluginInitOrchestrator } from '../../common/initialize-plugins.js';
import { InitializeOrchestrator } from '../../orchestrators/init.js';
import type { PluginManager, ResourceDefinitionMap } from '../../plugins/plugin-manager.js';
import { StubReporter } from '../../ui/reporters/stub-reporter.js';
import { ShellUtils } from '../../utils/shell.js';
import { removeSupersededTypes } from '../../utils/superseded-types.js';

/**
 * `codify_inspect`: report what is installed on this machine using Codify's own plugins (the same import logic as
 * `codify init` / `codify import`), instead of the agent guessing with shell commands. The result is already in Codify
 * config format, so the agent can edit it and pass it straight to codify_plan.
 */

export interface InspectArgs {
  /** Resource types to inspect (ex: ["homebrew", "nvm"]). Empty or missing: every type supported on this machine. */
  types?: string[];
}

export interface InspectResult {
  /** Resources currently on the machine, as Codify config blocks */
  installed: Array<Record<string, unknown>>;
  /** Requested types that are supported but not present on this machine */
  notInstalled: string[];
  /** Requested types that no plugin provides */
  unknownTypes?: string[];
  /** Types that are supported by plugins but not on this OS / distro */
  unsupportedOnThisMachine?: string[];
  /** Types that failed to inspect */
  errors?: Array<{ error: string; type: string; }>;
  /** Set when the output was shortened to keep it small */
  truncated?: string;
}

const PER_TYPE_TIMEOUT_MS = 60_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_RESULT_CHARS = 40_000;

export class InspectTool {
  /** A scan of every type takes a while; it's reused until something is applied. */
  private fullScan: InspectResult | null = null;

  invalidate(): void {
    this.fullScan = null;
  }

  async run(args: InspectArgs): Promise<InspectResult> {
    const requested = [...new Set((args.types ?? []).map((t) => t.trim()).filter(Boolean))];
    if (requested.length === 0 && this.fullScan) {
      return this.fullScan;
    }

    let pluginManager: PluginManager | undefined;
    try {
      const init = await PluginInitOrchestrator.run({ forceEmptyProject: true, noProgress: true }, new StubReporter());
      pluginManager = init.pluginManager;
      const result = await inspect(requested, init.pluginManager, init.resourceDefinitions);
      if (requested.length === 0) this.fullScan = result;
      return result;
    } finally {
      pluginManager?.dispose();
    }
  }
}

export async function inspect(
  requested: string[],
  pluginManager: PluginManager,
  definitions: ResourceDefinitionMap,
): Promise<InspectResult> {
  const distro = os.type() === OS.Linux ? await ShellUtils.getLinuxDistro() : undefined;
  const supportedHere = (type: string) => InitializeOrchestrator.filterByOperatingSystemAndDistro(type, definitions, distro);

  let typesToInspect: string[];
  const unknownTypes: string[] = [];
  const unsupported: string[] = [];

  if (requested.length > 0) {
    typesToInspect = [];
    for (const type of requested) {
      if (!definitions.has(type)) unknownTypes.push(type);
      else if (supportedHere(type)) typesToInspect.push(type);
      else unsupported.push(type);
    }
  } else {
    // Like `codify init`: everything for this OS, without sensitive resources or types superseded by another type
    typesToInspect = removeSupersededTypes(
      [...definitions.keys()]
        .filter((type) => (definitions.get(type)?.sensitiveParameters ?? []).length === 0)
        .filter((type) => supportedHere(type)),
      definitions,
    );
  }

  const errors: Array<{ error: string; type: string }> = [];
  const found = await Promise.all(typesToInspect.map(async (type) => {
    try {
      const response = await withTimeout(
        pluginManager.importResource({ core: { type }, parameters: {} }, true),
        PER_TYPE_TIMEOUT_MS,
        `Timed out after ${PER_TYPE_TIMEOUT_MS / 1000}s`,
      );
      return { type, resources: (response.result ?? []).filter(Boolean) };
    } catch (error) {
      errors.push({ type, error: (error instanceof Error ? error.message : String(error)).slice(0, 500) });
      return { type, resources: [] as ResourceJson[] };
    }
  }));

  const failedTypes = new Set(errors.map((e) => e.type));
  const installed = found.flatMap(({ resources, type }) =>
    resources.map((r) => toConfigBlock(r, definitions.get(type)?.sensitiveParameters ?? [])));
  const notInstalled = found
    .filter(({ resources, type }) => resources.length === 0 && !failedTypes.has(type))
    .map(({ type }) => type);

  const result: InspectResult = {
    installed,
    // For a full scan, the list of absent types is long and not useful
    notInstalled: requested.length > 0 ? notInstalled : [],
    ...(unknownTypes.length > 0 ? { unknownTypes } : {}),
    ...(unsupported.length > 0 ? { unsupportedOnThisMachine: unsupported } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  };

  return limitSize(result);
}

function toConfigBlock(resource: ResourceJson, sensitiveParameters: string[]): Record<string, unknown> {
  const parameters: Record<string, unknown> = { ...resource.parameters };
  const notes: string[] = [];

  for (const [key, value] of Object.entries(parameters)) {
    if (sensitiveParameters.includes(key)) {
      parameters[key] = '<redacted>';
    } else if (Array.isArray(value) && value.length > MAX_ARRAY_ITEMS) {
      parameters[key] = value.slice(0, MAX_ARRAY_ITEMS);
      notes.push(`${key}: showing ${MAX_ARRAY_ITEMS} of ${value.length}`);
    }
  }

  return {
    ...resource.core,
    ...parameters,
    ...(notes.length > 0 ? { _truncated: notes.join('; ') } : {}),
  };
}

function limitSize(result: InspectResult): InspectResult {
  if (JSON.stringify(result).length <= MAX_RESULT_CHARS) return result;

  // Keep whole resources (a partial config block would be misleading) until the budget is used
  const kept: Array<Record<string, unknown>> = [];
  let size = 0;
  for (const resource of result.installed) {
    size += JSON.stringify(resource).length;
    if (size > MAX_RESULT_CHARS) break;
    kept.push(resource);
  }

  const omitted = result.installed.slice(kept.length).map((r) => String(r.type));
  return {
    ...result,
    installed: kept,
    truncated: `Output was too large. Not shown: ${[...new Set(omitted)].join(', ')}. Inspect those types by name.`,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
