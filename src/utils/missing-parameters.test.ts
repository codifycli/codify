import { describe, expect, it } from 'vitest';

import { PLACEHOLDER_VALUE as P } from '../entities/missing-parameter.js';
import {
  coerceParameterValue,
  findMissingParameters,
  formatParameterPath,
  setValueAtPath,
} from './missing-parameters.js';

// Schemas below are taken from @codifycli/default-plugin (trimmed down)
const gitRepositorySchema = {
  type: 'object',
  properties: {
    repository: { type: 'string', description: 'Remote repository URL to clone from.' },
    directory: { type: 'string' },
    parentDirectory: { type: 'string' },
    autoVerifySSH: { type: 'boolean' },
  },
  additionalProperties: false,
  oneOf: [
    { required: ['repository', 'directory'] },
    { required: ['repository', 'parentDirectory'] },
  ],
};

const awsProfileSchema = {
  type: 'object',
  properties: {
    profile: { type: 'string' },
    awsAccessKeyId: { type: 'string' },
    awsSecretAccessKey: { type: 'string' },
    csvCredentials: { type: 'string' },
  },
  oneOf: [
    { required: ['awsAccessKeyId', 'awsSecretAccessKey'] },
    { required: ['csvCredentials'] },
  ],
};

const sshConfigSchema = {
  type: 'object',
  properties: {
    hosts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          Host: { type: 'string' },
          HostName: { type: 'string', description: 'The real host name' },
          Port: { type: 'number' },
          AddKeysToAgent: { type: 'boolean' },
        },
      },
    },
  },
  required: ['hosts'],
};

const pipSchema = {
  type: 'object',
  properties: {
    install: {
      type: 'array',
      items: {
        oneOf: [
          { type: 'string' },
          { type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' } }, required: ['name'] },
        ],
      },
    },
  },
};

// Generated with z.toJSONSchema (zod v4) the same way plugin-core does
const zodSchema = {
  type: 'object',
  properties: {
    servers: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            properties: { type: { type: 'string', const: 'stdio' }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } },
            required: ['type', 'command'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: { type: { type: 'string', const: 'http' }, url: { type: 'string' } },
            required: ['type', 'url'],
            additionalProperties: false,
          },
        ],
      },
    },
    aliases: {
      type: 'array',
      items: {
        type: 'object',
        properties: { alias: { type: 'string' }, value: { type: 'string' } },
        required: ['alias', 'value'],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const paths = (result: ReturnType<typeof findMissingParameters>) => result.parameters.map((p) => formatParameterPath(p.path));

describe('findMissingParameters', () => {
  it('Returns nothing for a complete config', () => {
    const result = findMissingParameters(gitRepositorySchema, { repository: 'git@github.com:a/b.git', directory: '~/b' });
    expect(result).toEqual({ parameters: [], choices: [] });
  });

  it('Does not report null values', () => {
    const result = findMissingParameters(sshConfigSchema, { hosts: null });
    expect(result).toEqual({ parameters: [], choices: [] });
  });

  it('Reports missing top level required keys with schema info', () => {
    const result = findMissingParameters(sshConfigSchema, {});
    expect(result.parameters).toEqual([{ path: ['hosts'], reason: 'missing', type: 'array', itemsType: 'object', description: undefined }]);
  });

  it('Ignores core keys', () => {
    const result = findMissingParameters({ type: 'object', required: ['type', 'name', 'a'], properties: { a: { type: 'string' } } }, {});
    expect(paths(result)).toEqual(['a']);
  });

  it('Reports placeholders at any depth', () => {
    const result = findMissingParameters(sshConfigSchema, {
      hosts: [{ Host: 'github.com', HostName: P }, { Host: P, Port: P }],
    });

    expect(paths(result)).toEqual(['hosts[0].HostName', 'hosts[1].Host', 'hosts[1].Port']);
    expect(result.parameters[0]).toMatchObject({ reason: 'placeholder', type: 'string', description: 'The real host name' });
    expect(result.parameters[2]).toMatchObject({ type: 'number' });
  });

  it('Reports placeholders without a schema', () => {
    expect(paths(findMissingParameters(undefined, { a: { b: [P] } }))).toEqual(['a.b']);
    expect(paths(findMissingParameters(undefined, { a: { b: ['set', P] } }))).toEqual(['a.b[1]']);
  });

  const gitRepositoriesSchema = {
    type: 'object',
    properties: {
      repositories: { type: 'array', description: 'Remote repository URLs to clone.', items: { type: 'string' } },
      parentDirectory: { type: 'string' },
    },
    required: ['repositories', 'parentDirectory'],
  };

  it('Asks for a list made only of placeholders as a whole list', () => {
    const result = findMissingParameters(gitRepositoriesSchema, { parentDirectory: '~/projects', repositories: [P] });

    expect(result.parameters).toEqual([{
      path: ['repositories'],
      reason: 'placeholder',
      type: 'array',
      itemsType: 'string',
      description: 'Remote repository URLs to clone.',
    }]);
  });

  it('Uses the description of the list for a placeholder item', () => {
    const result = findMissingParameters(gitRepositoriesSchema, { parentDirectory: '~/projects', repositories: ['git@github.com:a/b.git', P] });

    expect(result.parameters).toEqual([{
      path: ['repositories', 1],
      reason: 'placeholder',
      type: 'string',
      itemsType: undefined,
      description: 'Remote repository URLs to clone.',
    }]);
  });

  it('Reports missing nested required keys', () => {
    const result = findMissingParameters(zodSchema, { aliases: [{ alias: 'gs', value: 'git status' }, { alias: 'gc' }] });
    expect(paths(result)).toEqual(['aliases[1].value']);
  });

  it('Picks the satisfied oneOf branch', () => {
    expect(findMissingParameters(gitRepositorySchema, { repository: 'r', parentDirectory: '~/p' }).choices).toEqual([]);
  });

  it('Reports a placeholder inside a satisfied oneOf branch', () => {
    const result = findMissingParameters(gitRepositorySchema, { repository: P, directory: '~/b' });
    expect(paths(result)).toEqual(['repository']);
    expect(result.choices).toEqual([]);
  });

  it('Asks for a choice when oneOf branches tie', () => {
    const result = findMissingParameters(gitRepositorySchema, { repository: 'r' });

    expect(result.parameters).toEqual([]);
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].path).toEqual([]);
    expect(result.choices[0].options.map((o) => o.label)).toEqual(['directory', 'parentDirectory']);
    expect(paths(result.choices[0].options[1].result)).toEqual(['parentDirectory']);
  });

  it('Requires values common to all branches before asking for the choice', () => {
    const result = findMissingParameters(gitRepositorySchema, {});
    expect(result.choices[0].options.map((o) => o.label)).toEqual(['repository + directory', 'repository + parentDirectory']);
    // Property info is inherited from the parent schema
    expect(result.choices[0].options[0].result.parameters[0]).toMatchObject({ type: 'string', description: 'Remote repository URL to clone from.' });
  });

  it('Asks for a choice when no branch has been started, sorted by fewest values', () => {
    const result = findMissingParameters(awsProfileSchema, { profile: 'default' });
    expect(result.choices[0].options.map((o) => o.label)).toEqual(['csvCredentials', 'awsAccessKeyId + awsSecretAccessKey']);
  });

  it('Uses the branch the user has already started', () => {
    const result = findMissingParameters(awsProfileSchema, { awsAccessKeyId: 'id' });
    expect(result.choices).toEqual([]);
    expect(paths(result)).toEqual(['awsSecretAccessKey']);
  });

  it('Rules out oneOf branches by type', () => {
    const result = findMissingParameters(pipSchema, { install: ['requests', { version: '1.0.0' }] });
    expect(paths(result)).toEqual(['install[1].name']);
  });

  it('Rules out discriminated union branches by their const', () => {
    const result = findMissingParameters(zodSchema, { servers: [{ type: 'http' }, { type: 'stdio', command: 'npx' }] });
    expect(result.choices).toEqual([]);
    expect(paths(result)).toEqual(['servers[0].url']);
  });

  it('Asks which discriminated union branch to use and fills the discriminator automatically', () => {
    const result = findMissingParameters(zodSchema, { servers: [{}] });

    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].path).toEqual(['servers', 0]);
    expect(result.choices[0].options.map((o) => o.label)).toEqual(['type: "stdio"', 'type: "http"']);

    const stdio = result.choices[0].options[0].result.parameters;
    expect(stdio.find((p) => p.path.at(-1) === 'type')).toMatchObject({ knownValue: 'stdio' });
    expect(stdio.find((p) => p.path.at(-1) === 'command')?.knownValue).toBeUndefined();
  });

  it('Prompts for the children of a missing required object', () => {
    const schema = {
      type: 'object',
      properties: {
        settings: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } }, required: ['a'] },
      },
      required: ['settings'],
    };

    expect(paths(findMissingParameters(schema, {}))).toEqual(['settings.a']);
  });

  it('Supports allOf', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, allOf: [{ required: ['a'] }, { required: ['b'] }] };
    expect(paths(findMissingParameters(schema, {}))).toEqual(['a', 'b']);
  });

  it('Supports additionalProperties (records)', () => {
    const schema = {
      type: 'object',
      properties: {
        env: { type: 'object', additionalProperties: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] } },
      },
    };

    expect(paths(findMissingParameters(schema, { env: { A: { v: '1' }, B: {}, C: { v: P } } }))).toEqual(['env.C.v', 'env.B.v']);
  });
});

describe('coerceParameterValue', () => {
  it('Converts strings to the schema type', () => {
    expect(coerceParameterValue('22', 'number')).toBe(22);
    expect(coerceParameterValue('abc', 'number')).toBe('abc');
    expect(coerceParameterValue('yes', 'boolean')).toBe(true);
    expect(coerceParameterValue('false', 'boolean')).toBe(false);
    expect(coerceParameterValue('a, b,c', 'array', 'string')).toEqual(['a', 'b', 'c']);
    expect(coerceParameterValue('1,2', 'array', 'number')).toEqual([1, 2]);
    expect(coerceParameterValue('[{"a":1}]', 'array', 'object')).toEqual([{ a: 1 }]);
    expect(coerceParameterValue('{"a":1}', 'object')).toEqual({ a: 1 });
    expect(coerceParameterValue('{bad', 'object')).toBe('{bad');
    expect(coerceParameterValue('text', undefined)).toBe('text');
  });

  it('Keeps already typed values', () => {
    expect(coerceParameterValue(5, 'number')).toBe(5);
    expect(coerceParameterValue(true, 'boolean')).toBe(true);
    expect(coerceParameterValue(['1'], 'array', 'number')).toEqual([1]);
  });
});

describe('setValueAtPath', () => {
  it('Sets values without mutating the original', () => {
    const original = { hosts: [{ Host: 'a', HostName: P }] };
    const result = setValueAtPath(original.hosts, [0, 'HostName'], 'github.com');

    expect(result).toEqual([{ Host: 'a', HostName: 'github.com' }]);
    expect(original.hosts[0].HostName).toBe(P);
  });

  it('Creates missing intermediates', () => {
    expect(setValueAtPath(undefined, [0, 'name'], 'x')).toEqual([{ name: 'x' }]);
    expect(setValueAtPath(undefined, ['a', 'b'], 1)).toEqual({ a: { b: 1 } });
  });
});
