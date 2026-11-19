import fs from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { PARAMETER_VALUES_FILE_ENV } from '../common/resolve-missing-parameters.js';
import { Session } from './socket-server.js';
import { MissingParametersResolver } from '../common/resolve-missing-parameters.js';
import { commandEnv, parseRunContext, parseVariableValues, removeVariableValues, withoutVariableValues } from './variable-values.js';

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

  it('passes the document being run and the secrets approved on the dashboard', async () => {
    const documentId = '3b241101-e2bb-4255-8caf-4136c566a962';
    expect(parseRunContext({ documentId, approvedSecrets: ['secrets.user.A', 'not a key', 3] })).toEqual({ documentId, approvedSecrets: ['secrets.user.A'] });
    expect(parseRunContext({ documentId: 'nope', approvedSecrets: 'secrets.user.A' })).toEqual({});

    const env = await commandEnv({ documentId, approvedSecrets: ['secrets.org.B'] }, session);
    process.env[PARAMETER_VALUES_FILE_ENV] = env[PARAMETER_VALUES_FILE_ENV];
    try {
      expect(await MissingParametersResolver.readValuesFile()).toEqual({
        parameters: [], variables: [], documentId, approvedSecrets: ['secrets.org.B'],
      });
    } finally {
      delete process.env[PARAMETER_VALUES_FILE_ENV];
    }
  });
});
