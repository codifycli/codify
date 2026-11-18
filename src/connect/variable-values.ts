import fs from 'node:fs/promises';

import type { ResolvedVariable } from '../variables/variable-resolver.js';

import { MissingParametersResolver, PARAMETER_VALUES_FILE_ENV } from '../common/resolve-missing-parameters.js';
import { type Session } from './socket-server.js';

const NAME_REGEX = /^[\w\-]+$/u;

/** The values of the variables sent by the dashboard with a command (`variables` in the request body). */
export function parseVariableValues(body: Record<string, unknown>): ResolvedVariable[] {
  const { variables } = body;
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return [];
  }

  const isValue = (value: unknown) => ['boolean', 'number', 'string'].includes(typeof value)
    || (Array.isArray(value) && value.every((v) => ['boolean', 'number', 'string'].includes(typeof v)));

  return Object.entries(variables)
    .filter(([name, value]) => NAME_REGEX.test(name) && value !== '' && isValue(value))
    .map(([name, value]) => ({ scope: [], name, value: value as ResolvedVariable['value'] }));
}

/**
 * The environment of a command started from the dashboard. Values of variables are passed through a private values
 * file (never on the command line, they can be sensitive). Values that are not sent are asked in the terminal.
 */
export async function commandEnv(body: Record<string, unknown>, session: Session): Promise<NodeJS.ProcessEnv> {
  const variables = parseVariableValues(body);
  if (variables.length === 0) {
    return process.env;
  }

  const { dir, file } = await MissingParametersResolver.writeValuesToTempDir([], variables);
  session.additionalData.valuesDir = dir;
  return { ...process.env, [PARAMETER_VALUES_FILE_ENV]: file };
}

export async function removeVariableValues(session: Session): Promise<void> {
  if (!session.additionalData.valuesDir) {
    return;
  }

  await fs.rm(session.additionalData.valuesDir as string, { recursive: true, force: true });
  delete session.additionalData.valuesDir;
}

/** The request body without the values of the variables (for logging) */
export function withoutVariableValues(body: Record<string, unknown>): Record<string, unknown> {
  const { variables, ...rest } = body ?? {};
  return variables ? { ...rest, variables: Object.keys(variables) } : rest;
}
