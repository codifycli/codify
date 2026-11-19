import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  MissingParameter,
  MissingParameterPrompt,
  MissingParametersResult,
  PLACEHOLDER_VALUE,
  ParameterPath,
  ResourceMissingParameters,
} from '../entities/missing-parameter.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { coerceParameterValue, formatParameterPath, getValueAtPath, setValueAtPath } from '../utils/missing-parameters.js';
import type { ResolvedVariable } from '../variables/variable-resolver.js';
import { InitializationResult } from './initialize-plugins.js';

/**
 * A value filled in by the resolver. Used to forward answers to another run of Codify (ex: the `codify test` VM) so the
 * user isn't asked twice.
 */
export interface ResolvedParameter {
  /** Resource id (type or type.name). Unique within a project: duplicates without a name get one (ex: alias.0). */
  resourceId: string;
  path: ParameterPath;
  value: unknown;
}

/**
 * Points Codify to a file of values to use instead of prompting: { parameters: ResolvedParameter[], variables:
 * ResolvedVariable[] }. A plain list of ResolvedParameter is supported as well. Written by `codify test` (forwards the
 * values entered on the host to the VM) and by `codify connect` (values of the variables from the dashboard).
 */
export const PARAMETER_VALUES_FILE_ENV = 'CODIFY_PARAMETER_VALUES_FILE';

interface ValuesFile {
  parameters: ResolvedParameter[];
  variables: ResolvedVariable[];
  // Sent by the dashboard (codify connect): the document being run and the saved secrets approved for this run
  documentId?: string;
  approvedSecrets?: string[];
}

/** What the dashboard sends with a run (codify connect), besides the values */
export interface RunContext {
  documentId?: string;
  approvedSecrets?: string[];
}

/**
 * Prompts the user for values that are still needed before planning: required keys that are missing and values set to
 * the dashboard placeholder ('<Replace me here!>'). Answers are applied to the in-memory project only. They are never
 * written back to the config file.
 *
 * Must run after plugins are initialized (resource schemas are needed) and before validation.
 */
export const MissingParametersResolver = {
  /**
   * @param presetValues Values to use instead of prompting (ex: forwarded from the host by `codify test`). They are
   * only applied where the config is still missing the value or has the placeholder: an edited config always wins.
   * @returns Every value that was filled in
   */
  async run(
    initializationResult: InitializationResult,
    reporter: Reporter,
    presetValues: ResolvedParameter[] = [],
  ): Promise<ResolvedParameter[]> {
    const { project, pluginManager, resourceDefinitions } = initializationResult;
    const resolved: ResolvedParameter[] = MissingParametersResolver.applyPresetValues(project, presetValues);

    const fill = (resource: ResourceConfig, parameter: MissingParameter, value: unknown) => {
      MissingParametersResolver.setParameter(resource, parameter, value);
      resolved.push({ resourceId: resource.id, path: parameter.path, value });
    };

    // Unknown types are reported by validation
    const types = [...new Set(project.resourceConfigs.map((r) => r.type))].filter((t) => resourceDefinitions.has(t));
    const resourceInfoMap = new Map(
      (await pluginManager.getMultipleResourceInfo(types)).map((info) => [info.type, info])
    );

    const requests: ResourceMissingParameters[] = [];
    for (const resource of project.resourceConfigs) {
      const resourceInfo = resourceInfoMap.get(resource.type);
      if (!resourceInfo) {
        continue;
      }

      const missing = await MissingParametersResolver.resolveChoices(
        resourceInfo.findMissingParameters(resource),
        resource,
        reporter,
      );

      // Values known from the schema (ex: discriminators of the chosen option) are filled without asking
      for (const parameter of missing.filter((p) => p.knownValue !== undefined)) {
        fill(resource, parameter, parameter.knownValue);
      }

      const sensitiveParameters = resourceDefinitions.get(resource.type)?.sensitiveParameters ?? [];
      const prompts: MissingParameterPrompt[] = missing
        .filter((p) => p.knownValue === undefined)
        .map((p) => ({
          ...p,
          label: formatParameterPath(p.path),
          sensitive: sensitiveParameters.includes('*') || sensitiveParameters.includes(String(p.path[0])),
        }));

      if (prompts.length > 0) {
        requests.push({ resource, parameters: prompts, sensitiveParameters });
      }
    }

    if (requests.length === 0) {
      return resolved;
    }

    const answers = await reporter.promptMissingParameters(requests);
    for (const [idx, { resource, parameters }] of requests.entries()) {
      for (const [parameterIdx, parameter] of parameters.entries()) {
        fill(resource, parameter, coerceParameterValue(answers[idx]?.[parameterIdx], parameter.type, parameter.itemsType));
      }
    }

    return resolved;
  },

  applyPresetValues(project: Project, presetValues: ResolvedParameter[]): ResolvedParameter[] {
    if (presetValues.length === 0) {
      return [];
    }

    const applied: ResolvedParameter[] = [];

    for (const resource of project.resourceConfigs) {
      for (const preset of presetValues) {
        if (preset.resourceId !== resource.id || preset.path.length === 0) {
          continue;
        }

        const current = getValueAtPath(resource.parameters, preset.path);
        if (current === undefined || current === PLACEHOLDER_VALUE) {
          MissingParametersResolver.setParameter(resource, { path: preset.path, reason: 'missing' }, preset.value);
          applied.push(preset);
        }
      }
    }

    return applied;
  },

  /** The missing parameter values of the file pointed to by {@link PARAMETER_VALUES_FILE_ENV}. [] when it isn't set. */
  async loadPresetValues(): Promise<ResolvedParameter[]> {
    return (await MissingParametersResolver.readValuesFile()).parameters;
  },

  /** The variable values of the file pointed to by {@link PARAMETER_VALUES_FILE_ENV}. [] when it isn't set. */
  async loadPresetVariables(): Promise<ResolvedVariable[]> {
    return (await MissingParametersResolver.readValuesFile()).variables;
  },

  async readValuesFile(): Promise<ValuesFile> {
    const filePath = process.env[PARAMETER_VALUES_FILE_ENV];
    if (!filePath) {
      return { parameters: [], variables: [] };
    }

    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const file: ValuesFile = Array.isArray(parsed)
      ? { parameters: parsed, variables: [] }
      : {
        parameters: parsed?.parameters ?? [],
        variables: parsed?.variables ?? [],
        documentId: typeof parsed?.documentId === 'string' ? parsed.documentId : undefined,
        approvedSecrets: Array.isArray(parsed?.approvedSecrets) ? parsed.approvedSecrets.filter((s: unknown) => typeof s === 'string') : undefined,
      };

    const isObjectFormat = parsed !== null && typeof parsed === 'object'
      && ['parameters', 'variables', 'documentId', 'approvedSecrets'].some((key) => key in parsed);
    const isValid = (Array.isArray(parsed) || isObjectFormat)
      && Array.isArray(file.parameters)
      && Array.isArray(file.variables)
      && file.parameters.every((p) => typeof p?.resourceId === 'string' && Array.isArray(p?.path))
      && file.variables.every((v) => typeof v?.name === 'string' && Array.isArray(v?.scope) && v.value !== undefined);

    if (!isValid) {
      throw new Error(`Invalid parameter values file: ${filePath} (set by ${PARAMETER_VALUES_FILE_ENV})`);
    }

    return file;
  },

  /**
   * Writes values to a new private temp directory (readable only by the current user). Values can be sensitive: the
   * caller must remove the directory when done.
   */
  async writeValuesToTempDir(values: ResolvedParameter[], variables: ResolvedVariable[] = [], context: RunContext = {}): Promise<{ dir: string; file: string }> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-values-'));
    await fs.chmod(dir, 0o700);

    const file = path.join(dir, 'values.json');
    const contents: ValuesFile = { parameters: values, variables, ...context };
    await fs.writeFile(file, JSON.stringify(contents), { mode: 0o600 });
    return { dir, file };
  },

  /**
   * Flattens the result into a list of parameters. Where the schema allows multiple options (oneOf / anyOf) the user is
   * asked to pick one first.
   */
  async resolveChoices(
    result: MissingParametersResult,
    resource: ResourceConfig,
    reporter: Reporter,
  ): Promise<MissingParameter[]> {
    const parameters = [...result.parameters];

    for (const choice of result.choices) {
      const location = choice.path.length > 0 ? ` at "${formatParameterPath(choice.path)}"` : '';
      const selected = await reporter.promptOptions(
        `Resource "${resource.id}" requires one of the following options${location}. Which one would you like to configure?`,
        choice.options.map((o) => o.label),
      );

      const option = choice.options[selected];
      if (!option) {
        throw new Error(`Invalid option selected for resource "${resource.id}"`);
      }

      parameters.push(...await MissingParametersResolver.resolveChoices(option.result, resource, reporter));
    }

    // The same value can be reported by more than one branch of a schema
    const seen = new Set<string>();
    return parameters.filter((p) => {
      const key = JSON.stringify(p.path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  setParameter(resource: ResourceConfig, parameter: MissingParameter, value: unknown): void {
    const [key, ...rest] = parameter.path;
    resource.setParameter(String(key), setValueAtPath(resource.parameters[key], rest, value));
  },
};
