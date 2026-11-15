import {
  MissingParameter,
  MissingParameterPrompt,
  MissingParametersResult,
  ResourceMissingParameters,
} from '../entities/missing-parameter.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { coerceParameterValue, formatParameterPath, setValueAtPath } from '../utils/missing-parameters.js';
import { InitializationResult } from './initialize-plugins.js';

/**
 * Prompts the user for values that are still needed before planning: required keys that are missing and values set to
 * the dashboard placeholder ('<Replace me here!>'). Answers are applied to the in-memory project only. They are never
 * written back to the config file.
 *
 * Must run after plugins are initialized (resource schemas are needed) and before validation.
 */
export const MissingParametersResolver = {
  async run(initializationResult: InitializationResult, reporter: Reporter): Promise<void> {
    const { project, pluginManager, resourceDefinitions } = initializationResult;

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
        MissingParametersResolver.setParameter(resource, parameter, parameter.knownValue);
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
      return;
    }

    const answers = await reporter.promptMissingParameters(requests);
    for (const [idx, { resource, parameters }] of requests.entries()) {
      for (const [parameterIdx, parameter] of parameters.entries()) {
        const value = coerceParameterValue(answers[idx]?.[parameterIdx], parameter.type, parameter.itemsType);
        MissingParametersResolver.setParameter(resource, parameter, value);
      }
    }
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
