import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SavedValuesClient } from '../api/saved-values/index.js';
import { SecretsDeclinedError, VariableError } from '../common/errors.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { VariableConfig } from '../entities/variable-config.js';
import { mergeImportedIntoExisting } from '../generators/preserve-existing-values.js';
import { CodifyParser } from '../parser/index.js';
import { SecretRedactor } from '../utils/secret-redactor.js';
import { isSavedKey, parseSavedKey } from './saved-references.js';
import { SavedValuesLoader, closestKey } from './saved-values.js';
import { SecretsApproval } from './secrets-approval.js';
import { findReferences, substitute } from './substitution.js';
import { VariablePromptRequest, VariableResolver } from './variable-resolver.js';

const reporter = { promptSecretsApproval: vi.fn() } as never;

describe('saved references', () => {
  it('parses saved variable and secret keys', () => {
    expect(parseSavedKey('secrets.user.GITHUB_TOKEN')).toEqual({ kind: 'secret', scope: 'user', name: 'GITHUB_TOKEN', key: 'secrets.user.GITHUB_TOKEN' });
    expect(parseSavedKey('vars.org.REGION')).toEqual({ kind: 'variable', scope: 'organization', name: 'REGION', key: 'vars.org.REGION' });
    expect(parseSavedKey('secrets.file.DB')).toMatchObject({ scope: 'document' });
    expect(parseSavedKey('secrets.team.X')).toBeUndefined();
    expect(parseSavedKey('projectName')).toBeUndefined();
    expect(isSavedKey('astro.projectName')).toBe(false);
  });

  it('are references like variables (escaped ones are kept)', () => {
    expect([...findReferences('${{ secrets.user.A }} ${{ name }} $${{ secrets.org.B }} ${{ astro.x }}')]).toEqual(['secrets.user.A', 'name']);
    expect(substitute('Bearer ${{ secrets.user.TOKEN }}', () => 'abc')).toBe('Bearer abc');
    expect(substitute('$${{ secrets.user.TOKEN }}', () => 'abc')).toBe('${{ secrets.user.TOKEN }}');
  });

  it('suggests the key that was probably meant', () => {
    const known = ['secrets.user.GITHUB_TOKEN', 'secrets.org.NPM_TOKEN', 'vars.user.GITUB_TOKEN'];
    expect(closestKey(parseSavedKey('secrets.user.GITUB_TOKEN')!, known)).toBe('secrets.user.GITHUB_TOKEN');
    // Same name in another scope
    expect(closestKey(parseSavedKey('secrets.user.NPM_TOKEN')!, known)).toBe('secrets.org.NPM_TOKEN');
    expect(closestKey(parseSavedKey('secrets.user.github_token')!, known)).toBe('secrets.user.GITHUB_TOKEN');
    expect(closestKey(parseSavedKey('secrets.user.SOMETHING_ELSE')!, known)).toBeUndefined();
    // Only the same kind
    expect(closestKey(parseSavedKey('vars.user.NPM_TOKEN')!, known)).toBeUndefined();
  });
});

describe('SecretRedactor', () => {
  afterEach(() => SecretRedactor.clear());

  it('masks registered values', () => {
    SecretRedactor.register('s3cr3t-value');
    SecretRedactor.register('abc'); // too short to be masked in text
    expect(SecretRedactor.redact('token=s3cr3t-value; abc')).toBe('token=********; abc');
    expect(SecretRedactor.redactValue({ a: ['s3cr3t-value'], b: 1 })).toEqual({ a: ['********'], b: 1 });
  });

  it('masks a secret split across chunks of a stream', async () => {
    SecretRedactor.register('s3cr3t-value');
    const output: string[] = [];
    const write = SecretRedactor.stream((text) => output.push(text));

    write('cloning with s3cr');
    write('3t-value done\n');
    write('no secrets s3c');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(output.join('')).toBe('cloning with ******** done\nno secrets s3c');
    expect(output.join('')).not.toContain('s3cr3t');
  });
});

describe('SavedValuesLoader', () => {
  beforeEach(() => {
    vi.spyOn(SavedValuesClient, 'isLoggedIn', 'get').mockReturnValue(true);
    vi.spyOn(SecretsApproval, 'ensureApproved').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    SecretRedactor.clear();
  });

  const project = (configs: unknown[]) => CodifyParser.parseJson(configs as never);
  const options = { allowed: true, configKey: 'codify.jsonc', presetKeys: new Set<string>(), reporter };

  it('finds the saved references of the project file and where they are used', async () => {
    const references = SavedValuesLoader.findReferences(await project([
      { type: 'git-repository', name: 'work', token: '${{ secrets.user.GITHUB_TOKEN }}', dir: '${{ dir }}' },
      { type: 'template', source: '@acme/deploy', variables: { token: '${{ secrets.org.DEPLOY }}' } },
      { type: 'variable', name: 'region', default: '${{ vars.org.REGION }}' },
    ]));

    expect([...references.entries()].map(([key, r]) => [key, [...r.usedBy]])).toEqual([
      ['secrets.user.GITHUB_TOKEN', ['git-repository.work']],
      ['secrets.org.DEPLOY', ['template @acme/deploy (token)']],
      ['vars.org.REGION', ['the default of variable region']],
    ]);
  });

  it('resolves the references, asks to approve the secrets and masks their values', async () => {
    const resolve = vi.spyOn(SavedValuesClient, 'resolve').mockResolvedValue({
      values: new Map([['secrets.user.GITHUB_TOKEN', 'ghp_123456'], ['vars.org.REGION', 'us-east-1']]),
      secretKeys: new Set(['secrets.user.GITHUB_TOKEN']),
    });

    const saved = await SavedValuesLoader.load(await project([
      { type: 'git-repository', token: '${{ secrets.user.GITHUB_TOKEN }}', region: '${{ vars.org.REGION }}' },
    ]), { ...options, documentId: 'doc-1', approvedSecrets: ['secrets.org.OTHER'] });

    expect(resolve).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'secrets.user.GITHUB_TOKEN' }),
      expect.objectContaining({ key: 'vars.org.REGION' }),
    ], 'doc-1');
    expect(saved.presets).toEqual([
      { scope: [], name: 'secrets.user.GITHUB_TOKEN', value: 'ghp_123456' },
      { scope: [], name: 'vars.org.REGION', value: 'us-east-1' },
    ]);
    expect([...saved.sensitiveKeys]).toEqual(['secrets.user.GITHUB_TOKEN']);
    expect(SecretsApproval.ensureApproved).toHaveBeenCalledWith(
      [{ key: 'secrets.user.GITHUB_TOKEN', description: 'personal secret', usedBy: ['git-repository'] }],
      reporter,
      { configKey: 'codify.jsonc', approvedSecrets: ['secrets.org.OTHER'], autoApproveAll: undefined },
    );
    expect(SecretRedactor.redact('ghp_123456')).toBe('********');
  });

  it('explains why missing references are asked and points out typos', async () => {
    vi.spyOn(SavedValuesClient, 'resolve').mockResolvedValue({ values: new Map(), secretKeys: new Set() });
    vi.spyOn(SavedValuesClient, 'listKeys').mockResolvedValue(['secrets.user.GITHUB_TOKEN']);

    const saved = await SavedValuesLoader.load(await project([
      { type: 'alpha', token: '${{ secrets.user.GITUB_TOKEN }}', npm: '${{ secrets.org.NPM }}' },
    ]), options);

    expect(saved.presets).toEqual([]);
    expect(saved.hints.get('secrets.user.GITUB_TOKEN')).toBe('No saved personal secret named GITUB_TOKEN. Did you mean secrets.user.GITHUB_TOKEN? Enter a value for this run, or press esc and add it in Settings › Variables & Secrets.');
    expect(saved.hints.get('secrets.org.NPM')).toContain('An admin of your organization can add it.');
    expect(SecretsApproval.ensureApproved).not.toHaveBeenCalled();
  });

  it('asks for everything when not logged in, and skips values that are already known', async () => {
    vi.spyOn(SavedValuesClient, 'isLoggedIn', 'get').mockReturnValue(false);
    const resolve = vi.spyOn(SavedValuesClient, 'resolve');

    const saved = await SavedValuesLoader.load(await project([
      { type: 'alpha', token: '${{ secrets.user.TOKEN }}', other: '${{ secrets.user.KNOWN }}' },
    ]), { ...options, presetKeys: new Set(['secrets.user.KNOWN']) });

    expect(resolve).not.toHaveBeenCalled();
    expect([...saved.hints.keys()]).toEqual(['secrets.user.TOKEN']);
    expect(saved.hints.get('secrets.user.TOKEN')).toContain('codify login');
    expect([...saved.sensitiveKeys]).toEqual(['secrets.user.TOKEN', 'secrets.user.KNOWN']);
  });

  it('refuses saved references in configs written by the agent', async () => {
    await expect(SavedValuesLoader.load(await project([{ type: 'alpha', t: '${{ secrets.user.T }}' }]), { ...options, allowed: false }))
      .rejects.toThrow("Configs written by the Codify agent can't use saved variables or secrets: secrets.user.T");
    await expect(SavedValuesLoader.load(await project([{ type: 'alpha', t: 'none' }]), { ...options, allowed: false }))
      .resolves.toEqual({ presets: [], sensitiveKeys: new Set(), hints: new Map() });
  });
});

describe('SecretsApproval', () => {
  let storePath: string;
  const requests = [{ key: 'secrets.user.T', description: 'personal secret', usedBy: ['a'] }];

  beforeEach(async () => {
    storePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'codify-secrets-')), 'approved.json');
  });

  it('asks once per config, and again when the secrets change', async () => {
    const ask = vi.fn().mockResolvedValue(true);
    const prompt = { promptSecretsApproval: ask } as never;

    await SecretsApproval.ensureApproved(requests, prompt, { configKey: 'a.jsonc', storePath });
    await SecretsApproval.ensureApproved(requests, prompt, { configKey: 'a.jsonc', storePath });
    expect(ask).toHaveBeenCalledTimes(1);

    await SecretsApproval.ensureApproved([{ ...requests[0], usedBy: ['a', 'b'] }], prompt, { configKey: 'a.jsonc', storePath });
    await SecretsApproval.ensureApproved(requests, prompt, { configKey: 'b.jsonc', storePath });
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it('does not ask for secrets approved on the dashboard or with --auto-approve-all', async () => {
    const ask = vi.fn();
    await SecretsApproval.ensureApproved(requests, { promptSecretsApproval: ask } as never, { configKey: 'a', storePath, approvedSecrets: ['secrets.user.T'] });
    await SecretsApproval.ensureApproved(requests, { promptSecretsApproval: ask } as never, { configKey: 'a', storePath, autoApproveAll: true });
    expect(ask).not.toHaveBeenCalled();
  });

  it('stops the run when declined', async () => {
    await expect(SecretsApproval.ensureApproved(requests, { promptSecretsApproval: async () => false } as never, { configKey: 'a', storePath }))
      .rejects.toBeInstanceOf(SecretsDeclinedError);
  });
});

describe('VariableResolver with saved references', () => {
  afterEach(() => SecretRedactor.clear());

  const scope = { labels: [], location: 'codify.jsonc' };
  const variable = (config: Record<string, unknown>) => new VariableConfig({ type: 'variable', ...config } as never);

  it('uses the saved values, masks secrets in the plan and does not report them as implicit variables', async () => {
    const resource = new ResourceConfig({ type: 'git-repository', token: 'Bearer ${{ secrets.user.T }}', region: '${{ vars.org.R }}' });
    const resolver = new VariableResolver(async () => { throw new Error('not asked'); }, [
      { scope: [], name: 'secrets.user.T', value: 'tok_123456' },
      { scope: [], name: 'vars.org.R', value: 'eu' },
    ], undefined, { sensitiveKeys: new Set(['secrets.user.T']), hints: new Map() });

    const result = await resolver.resolveScope([resource], scope);

    expect(resource.parameters).toEqual({ token: 'Bearer tok_123456', region: 'eu' });
    expect([...resource.sensitiveParameterKeys]).toEqual(['token']);
    expect(result.implicitVariables).toEqual([]);
    expect(SecretRedactor.redact('tok_123456')).toBe('********');
  });

  it('asks for missing saved values with their hint, masked for secrets', async () => {
    const requests: VariablePromptRequest[] = [];
    const resource = new ResourceConfig({ type: 'alpha', token: '${{ secrets.user.T }}' });
    await new VariableResolver(async (request) => {
      requests.push(request);
      return 'typed_value';
    }, [], undefined, { sensitiveKeys: new Set(['secrets.user.T']), hints: new Map([['secrets.user.T', 'No saved personal secret named T.']]) })
      .resolveScope([resource], scope);

    expect(requests).toEqual([expect.objectContaining({
      name: 'secrets.user.T', label: 'secrets.user.T', description: 'No saved personal secret named T.', sensitive: true, implicit: false,
    })]);
    expect(resource.parameters.token).toBe('typed_value');
    expect(SecretRedactor.redact('typed_value')).toBe('********');
  });

  it('refuses saved references in templates and keeps passed secrets sensitive', async () => {
    await expect(new VariableResolver().resolveScope(
      [new ResourceConfig({ type: 'alpha', t: '${{ secrets.user.T }}' })] as never,
      { labels: ['deploy'], location: 'template @acme/deploy' },
    )).rejects.toThrow("Templates can't use saved variables or secrets (secrets.user.T)");

    // Passed from the config being run
    const template = new TemplateConfig({ type: 'template', source: '@acme/deploy', variables: { token: '${{ secrets.user.T }}', region: 'eu' } });
    await new VariableResolver(async () => 'x', [{ scope: [], name: 'secrets.user.T', value: 'tok_123456' }], undefined, {
      sensitiveKeys: new Set(['secrets.user.T']), hints: new Map(),
    }).resolveScope([template], scope);
    expect(template.resolvedVariables).toEqual({ token: 'tok_123456', region: 'eu' });
    expect([...template.resolvedSensitiveVariables!]).toEqual(['token']);

    // In the template, the variable is sensitive even if it isn't declared so
    const inTemplate = new ResourceConfig({ type: 'alpha', auth: '${{ token }}', region: '${{ region }}' });
    await new VariableResolver().resolveScope([variable({ name: 'token' }), variable({ name: 'region' }), inTemplate], {
      labels: ['deploy'], location: 'template @acme/deploy', passed: template.resolvedVariables, passedSensitive: template.resolvedSensitiveVariables,
    });
    expect([...inTemplate.sensitiveParameterKeys]).toEqual(['auth']);
  });

  it('accepts saved references in --var', () => {
    expect(VariableResolver.parseVarFlags(['secrets.user.TOKEN=abc', 'astro.port=1'])).toEqual([
      { scope: [], name: 'secrets.user.TOKEN', value: 'abc' },
      { scope: ['astro'], name: 'port', value: '1' },
    ]);
  });

  it('keeps saved references when import and refresh write back to the file', () => {
    expect(mergeImportedIntoExisting(
      { type: 'git-repository', token: '${{ secrets.user.T }}', depth: 1 },
      { token: 'tok_123456', depth: 2 },
    )).toEqual({ type: 'git-repository', token: '${{ secrets.user.T }}', depth: 2 });
  });

  it('refuses saved references in conditions (they are not declared variables)', async () => {
    await expect(new VariableResolver().resolveScope(
      [new ResourceConfig({ type: 'alpha', when: { 'secrets.user.T': 'x' } } as never)] as never,
      scope,
    )).rejects.toBeInstanceOf(VariableError);
  });
});
