import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '../../config.js';
import { LoginHelper } from '../../connect/login-helper.js';
import { ctx, Event } from '../../events/context.js';
import { SecretRedactor } from '../../utils/secret-redactor.js';
import { parseSavedKey } from '../../variables/saved-references.js';
import { SavedValuesClient } from './index.js';

describe('SavedValuesClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves references with the login of the CLI', async () => {
    vi.spyOn(LoginHelper, 'get').mockReturnValue({ isLoggedIn: true, credentials: { accessToken: 'jwt' } } as never);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      // eslint-disable-next-line camelcase
      { ref_kind: 'secret', ref_scope: 'user', ref_name: 'TOKEN', ref_value: 'abc' },
      // eslint-disable-next-line camelcase
      { ref_kind: 'variable', ref_scope: 'organization', ref_name: 'REGION', ref_value: 'eu' },
    ])));

    const result = await SavedValuesClient.resolve([parseSavedKey('secrets.user.TOKEN')!, parseSavedKey('vars.org.REGION')!], 'doc-1');

    expect(result.values).toEqual(new Map([['secrets.user.TOKEN', 'abc'], ['vars.org.REGION', 'eu']]));
    expect(result.secretKeys).toEqual(new Set(['secrets.user.TOKEN']));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${config.supabaseUrl}/rest/v1/rpc/resolve_variables`);
    expect(init?.headers).toMatchObject({ apikey: config.supabasePublishableKey, authorization: 'Bearer jwt' });
    expect(JSON.parse(init?.body as string)).toEqual({
      // eslint-disable-next-line camelcase
      p_document_id: 'doc-1',
      // eslint-disable-next-line camelcase
      p_refs: [{ kind: 'secret', scope: 'user', name: 'TOKEN' }, { kind: 'variable', scope: 'organization', name: 'REGION' }],
    });
  });

  it('lists the keys of the saved entries (names only)', async () => {
    vi.spyOn(LoginHelper, 'get').mockReturnValue({ isLoggedIn: true, credentials: { accessToken: 'jwt' } } as never);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ kind: 'secret', scope: 'document', name: 'DB' }])));

    expect(await SavedValuesClient.listKeys()).toEqual(['secrets.file.DB']);
    expect(fetchMock.mock.calls[0][0]).toBe(`${config.supabaseUrl}/rest/v1/variables?select=kind,scope,name`);
  });

  it('fails clearly when the request fails or when not logged in', async () => {
    vi.spyOn(LoginHelper, 'get').mockReturnValue({ isLoggedIn: true, credentials: { accessToken: 'jwt' } } as never);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('denied', { status: 401 }));
    await expect(SavedValuesClient.listKeys()).rejects.toThrow('Unable to load saved variables and secrets (401): denied');

    vi.spyOn(LoginHelper, 'get').mockReturnValue(undefined);
    expect(SavedValuesClient.isLoggedIn).toBe(false);
    await expect(SavedValuesClient.listKeys()).rejects.toThrow('Not logged in');
  });
});

describe('Output masking', () => {
  afterEach(() => SecretRedactor.clear());

  it('masks secrets in logs and plugin output', () => {
    SecretRedactor.register('tok_123456');
    const output: string[] = [];
    const listener = (text: string) => output.push(text);
    ctx.on(Event.OUTPUT, listener);

    try {
      ctx.log('using tok_123456');
      ctx.pluginStdout('default', 'cloning with tok_123456\n');
    } finally {
      ctx.off(Event.OUTPUT, listener);
    }

    expect(output.join('')).toBe('using ********\ncloning with ********\n');
  });
});
