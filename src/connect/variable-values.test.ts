import fs from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { PARAMETER_VALUES_FILE_ENV } from '../common/resolve-missing-parameters.js';
import { Session } from './socket-server.js';
import { commandEnv, parseVariableValues, removeVariableValues, withoutVariableValues } from './variable-values.js';

describe('Variable values sent by the dashboard', () => {
  const session = { additionalData: {} } as Session;

  afterEach(async () => {
    await removeVariableValues(session);
  });

  it('parses the values of the variables in the request body', () => {
    expect(parseVariableValues({ config: [] })).toEqual([]);
    expect(parseVariableValues({ variables: ['a'] })).toEqual([]);
    expect(parseVariableValues({
      variables: {
        projectName: 'site',
        port: 3000,
        useTs: true,
        tools: ['docker'],
        empty: '',
        'invalid name': 'x',
        object: { a: 1 },
      },
    })).toEqual([
      { scope: [], name: 'projectName', value: 'site' },
      { scope: [], name: 'port', value: 3000 },
      { scope: [], name: 'useTs', value: true },
      { scope: [], name: 'tools', value: ['docker'] },
    ]);
  });

  it('passes the values through a private values file', async () => {
    expect(await commandEnv({ config: [] }, session)).toBe(process.env);

    const env = await commandEnv({ variables: { token: 'secret' } }, session);
    const file = env[PARAMETER_VALUES_FILE_ENV]!;
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({
      parameters: [],
      variables: [{ scope: [], name: 'token', value: 'secret' }],
    });

    await removeVariableValues(session);
    await expect(fs.stat(file)).rejects.toThrow();
  });

  it('never logs the values', () => {
    expect(withoutVariableValues({ config: [1], variables: { token: 'secret' } })).toEqual({ config: [1], variables: ['token'] });
    expect(withoutVariableValues({ config: [1] })).toEqual({ config: [1] });
  });
});
