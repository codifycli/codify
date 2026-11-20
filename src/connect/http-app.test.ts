import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Router, createHttpApp, listen } from './http-app.js';

describe('http-app', () => {
  let server: Server;
  let baseUrl: string;
  const errors: string[] = [];

  beforeEach(async () => {
    errors.length = 0;

    const sessions = new Router();
    sessions.post('/:sessionId/start', (req, res) => res.status(200).json({ id: req.params.sessionId, body: req.body }));
    sessions.post('/:sessionId/empty', (_req, res) => res.status(204).json({}));

    const router = new Router();
    router.get('/capabilities', (_req, res) => res.status(200).json({ ok: true }));
    router.post('/throws', () => {
      throw new Error('sync failure');
    });
    router.post('/rejects', async () => {
      throw new Error('async failure');
    });
    router.use('/apply', sessions);

    server = createHttpApp(router, {
      bodyLimit: 1024,
      corsOrigins: ['https://dashboard.example.com'],
      middleware: [(req, res) => {
        if (req.header('Authorization') !== 'secret') {
          res.status(400).json({ error: 'Invalid authorization' });
          return false;
        }

        return true;
      }],
      onError: (error) => errors.push(error.message),
    });

    await listen(server, 0);
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => new Promise<void>((resolve) => {
    server.close(() => resolve());
  }));

  const post = (path: string, body: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, {
    body,
    headers: { Authorization: 'secret', 'Content-Type': 'application/json', ...headers },
    method: 'POST',
  });

  it('routes mounted routers with params and parses JSON bodies', async () => {
    const response = await post('/apply/abc-123/start', JSON.stringify({ config: [1] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ body: { config: [1] }, id: 'abc-123' });

    // Trailing slash and empty body
    const empty = await post('/apply/abc/start/', '');
    expect(await empty.json()).toEqual({ body: {}, id: 'abc' });

    const noContent = await post('/apply/abc/empty', '{}');
    expect(noContent.status).toBe(204);
    expect(await noContent.text()).toBe('');
  });

  it('checks the authorization of every request', async () => {
    const response = await fetch(`${baseUrl}/capabilities`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid authorization' });

    const authorized = await fetch(`${baseUrl}/capabilities`, { headers: { Authorization: 'secret' } });
    expect(await authorized.json()).toEqual({ ok: true });
  });

  it('answers CORS preflights for allowed origins without authorization', async () => {
    const response = await fetch(`${baseUrl}/apply/abc/start`, {
      headers: {
        'Access-Control-Request-Headers': 'authorization,content-type',
        'Access-Control-Request-Method': 'POST',
        Origin: 'https://dashboard.example.com',
      },
      method: 'OPTIONS',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://dashboard.example.com');
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization,content-type');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-private-network')).toBe('true');

    const other = await fetch(`${baseUrl}/capabilities`, {
      headers: { Authorization: 'secret', Origin: 'https://evil.example.com' },
    });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns errors as JSON', async () => {
    expect((await post('/throws', '{}')).status).toBe(500);
    const rejected = await post('/rejects', '{}');
    expect(rejected.status).toBe(500);
    expect(await rejected.json()).toEqual({ error: 'async failure' });
    expect(errors).toEqual(['sync failure', 'async failure']);

    expect((await post('/apply/abc/start', '{ invalid')).status).toBe(400);
    expect((await post('/apply/abc/start', '"a string"')).status).toBe(400);
    expect((await post('/apply/abc/start', JSON.stringify({ big: 'x'.repeat(2000) }))).status).toBe(413);
    expect((await post('/unknown', '{}')).status).toBe(404);
    expect((await fetch(`${baseUrl}/throws`, { headers: { Authorization: 'secret' } })).status).toBe(405);
  });

  it('rejects listen when the port is in use', async () => {
    const other = createHttpApp(new Router(), { corsOrigins: [] });
    await expect(listen(other, (server.address() as AddressInfo).port)).rejects.toThrow('EADDRINUSE');
  });
});
