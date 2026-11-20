import { Flags } from '@oclif/core';

import { type ResolvedVariable, VariableResolver } from '../variables/variable-resolver.js';
import { MissingParametersResolver, type RunContext } from './resolve-missing-parameters.js';

export const varFlag = Flags.string({
  description: 'Value for a variable, used instead of asking. Can be repeated. Use template.name=value for the variables of a template.',
  helpValue: 'name=value',
  multiple: true,
});

/**
 * The values of variables to use instead of asking: values forwarded through the values file (codify test, codify
 * connect) and --var flags. --var wins over forwarded values.
 */
export async function loadVariableValues(flags: { var?: string[] }): Promise<ResolvedVariable[]> {
  return [
    ...await MissingParametersResolver.loadPresetVariables(),
    ...VariableResolver.parseVarFlags(flags.var),
  ];
}

/**
 * Everything a run gets instead of asking: the values of variables (see loadVariableValues) and, for runs started from
 * the dashboard, the document being run and the saved secrets approved on the dashboard.
 */
export async function loadRunValues(flags: { var?: string[] }): Promise<RunContext & { variableValues: ResolvedVariable[] }> {
  const file = await MissingParametersResolver.readValuesFile();
  return {
    variableValues: [...file.variables, ...VariableResolver.parseVarFlags(flags.var)],
    documentId: file.documentId,
    approvedSecrets: file.approvedSecrets,
  };
}
