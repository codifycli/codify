import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/connect/login-helper.js', () => ({
  LoginHelper: { load: vi.fn(async () => ({ isLoggedIn: false })) },
}));

import { LoginHelper } from '../../src/connect/login-helper.js';
import { toUIMessages } from '../../src/prompt/agent-api.js';
import { anonymousSessionPath, PromptAuth } from '../../src/prompt/auth.js';
import { SessionStore } from '../../src/prompt/session-store.js';

// Unsigned JWT with the given claims (the CLI only decodes these, the server verifies them)
function jwt(claims: Record<string, unknown>): string {
  const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
}

function sessionResponse(sub: string, exp: number, refresh = 'refresh-1') {
  return new Response(JSON.stringify({ access_token: jwt({ sub, exp }), refresh_token: refresh, expires_at: exp }), { status: 200 });
}

describe('PromptAuth', () => {
  let home: string;
  const originalHome = process.env.HOME;
  const fetchMock = vi.fn();

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-auth-'));
    process.env.HOME = home;
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    vi.mocked(LoginHelper.load).mockResolvedValue({ isLoggedIn: false } as any);
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    vi.unstubAllGlobals();
    await fs.rm(home, { recursive: true, force: true });
  });

  it('uses the CLI login token when logged in', async () => {
    vi.mocked(LoginHelper.load).mockResolvedValue({
      isLoggedIn: true,
      credentials: { accessToken: 'login-token', userId: 'user-1', email: 'a@b.c', expiry: 0 },
    } as any);

    expect(await PromptAuth.get()).toEqual({ token: 'login-token', userId: 'user-1', isAnonymous: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in anonymously and stores the session with owner-only permissions', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    fetchMock.mockResolvedValueOnce(sessionResponse('anon-1', exp));

    const auth = await PromptAuth.get();
    expect(auth).toMatchObject({ userId: 'anon-1', isAnonymous: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/auth\/v1\/signup$/);
    expect(init.headers.apikey).toMatch(/^sb_publishable_/);

    const stat = await fs.stat(anonymousSessionPath());
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('reuses a valid stored session without any request', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    fetchMock.mockResolvedValueOnce(sessionResponse('anon-1', exp));
    await PromptAuth.get();
    fetchMock.mockReset();

    expect((await PromptAuth.get()).userId).toBe('anon-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired session and keeps the same anonymous user', async () => {
    const now = Math.floor(Date.now() / 1000);
    fetchMock.mockResolvedValueOnce(sessionResponse('anon-1', now + 30)); // inside the refresh margin
    await PromptAuth.get();

    fetchMock.mockResolvedValueOnce(sessionResponse('anon-1', now + 3600, 'refresh-2'));
    expect((await PromptAuth.get()).userId).toBe('anon-1');
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/token\?grant_type=refresh_token$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refresh_token: 'refresh-1' });
  });

  it('starts a new anonymous session when the refresh token is rejected', async () => {
    const now = Math.floor(Date.now() / 1000);
    fetchMock.mockResolvedValueOnce(sessionResponse('anon-1', now - 10));
    await PromptAuth.get();

    fetchMock
      .mockResolvedValueOnce(new Response('invalid refresh token', { status: 400 }))
      .mockResolvedValueOnce(sessionResponse('anon-2', now + 3600));
    expect((await PromptAuth.get()).userId).toBe('anon-2');
  });

  it('tells the user to log in when anonymous sign-ins are disabled', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      '{"code":422,"error_code":"anonymous_provider_disabled","msg":"Anonymous sign-ins are disabled"}',
      { status: 422 },
    ));
    await expect(PromptAuth.get()).rejects.toThrow(/codify login/);
  });
});

describe('SessionStore', () => {
  let home: string;
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-sessions-'));
    process.env.HOME = home;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(home, { recursive: true, force: true });
  });

  it('writes numbered configs under ~/.codify/sessions/<threadId>', async () => {
    const first = await SessionStore.writeConfig('thread-1', '[{ "type": "jq" }]');
    const second = await SessionStore.writeConfig('thread-1', '[]');

    expect(first).toBe(path.join(home, '.codify', 'sessions', 'thread-1', '001.codify.jsonc'));
    expect(second).toBe(path.join(home, '.codify', 'sessions', 'thread-1', '002.codify.jsonc'));
    expect(await fs.readFile(first, 'utf8')).toBe('[{ "type": "jq" }]\n');
  });

  it('keeps hostile thread ids inside the sessions directory', async () => {
    const file = await SessionStore.writeConfig('../../etc', '[]');
    expect(file.startsWith(path.join(home, '.codify', 'sessions') + path.sep)).toBe(true);
  });
});

describe('toUIMessages', () => {
  it('converts stored Mastra messages, including tool invocations', () => {
    const messages = toUIMessages([
      { id: 'u1', role: 'user', content: { format: 2, parts: [{ type: 'text', text: 'upgrade node' }] } },
      {
        id: 'a1', role: 'assistant', content: {
          format: 2, parts: [
            { type: 'step-start' },
            { type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: 'c1', toolName: 'read_file', args: { path: '~/.nvmrc' }, result: { content: '20' } } },
            { type: 'tool-invocation', toolInvocation: { state: 'call', toolCallId: 'c2', toolName: 'codify_apply', args: { config: '[]' } } },
            { type: 'text', text: 'Done' },
          ],
        },
      },
      { id: 's1', role: 'system', content: 'ignored' },
    ]);

    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].parts).toEqual([
      { type: 'dynamic-tool', toolName: 'read_file', toolCallId: 'c1', state: 'output-available', input: { path: '~/.nvmrc' }, output: { content: '20' } },
      { type: 'dynamic-tool', toolName: 'codify_apply', toolCallId: 'c2', state: 'output-error', input: { config: '[]' }, errorText: 'Interrupted' },
      { type: 'text', text: 'Done' },
    ]);
  });
});
