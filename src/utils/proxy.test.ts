import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Agent, setGlobalDispatcher } from 'undici';
import { afterAll, describe, expect, it } from 'vitest';

import { configureProxyFromEnv } from './proxy.js';

describe('configureProxyFromEnv', () => {
  const env = { ...process.env };
  afterAll(() => {
    process.env = env;
    setGlobalDispatcher(new Agent());
  });

  it('routes fetch through HTTP_PROXY and respects NO_PROXY', async () => {
    const tunnels: string[] = [];
    // The proxy agent tunnels every request with CONNECT. This proxy answers the tunneled request itself.
    const proxy = createServer();
    proxy.on('connect', (req, socket) => {
      tunnels.push(req.url!);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.once('data', () => {
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\nfrom proxy');
      });
    });
    const origin = createServer((_req, res) => res.end('direct'));
    await Promise.all([proxy, origin].map((s) => new Promise<void>((resolve) => {
      s.listen(0, '127.0.0.1', resolve);
    })));

    for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy']) {
      delete process.env[name];
    }

    process.env.HTTP_PROXY = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    process.env.NO_PROXY = '127.0.0.1';
    configureProxyFromEnv();

    expect(await (await fetch('http://releases.example.test/manifest')).text()).toBe('from proxy');
    expect(tunnels).toEqual(['releases.example.test:80']);

    // NO_PROXY hosts are not proxied
    expect(await (await fetch(`http://127.0.0.1:${(origin.address() as AddressInfo).port}/`)).text()).toBe('direct');
    expect(tunnels).toHaveLength(1);

    proxy.close();
    origin.close();
  });
});
