import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { MockReporter } from '../mocks/reporter.js';
import { ConnectOrchestrator } from '../../../src/orchestrators/connect';
import * as net from 'node:net';
import { config } from '../../../src/config.js';
import { fakeLogin, fakeLogout } from '../mocks/mock-login';
import * as open from 'open'
import { LoginOrchestrator } from '../../../src/orchestrators/login';
import { Server } from 'node:http';
import { vol } from 'memfs';

vi.mock(import('../../../src/orchestrators/login'), async () => {
  return {
    LoginOrchestrator: {
      run: async () => {}
    },
  }
})

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

vi.mock(import('open'), async () => {
  return {
    default: vi.fn()
  }
})

// The apply orchestrator directly calls plan so this will test both
describe.sequential('Connect orchestrator tests', () => {
  beforeEach(() => {
    vol.reset();
  })

  it('It will start a local server on config.connectServerPort', async () => {
    const reporter = new MockReporter();
    await fakeLogin();

    config.connectServerPort = Math.floor(Math.random() * 10000)

    const openSpy = vi.spyOn(open, 'default');

    await new Promise<void>((done) => {
      ConnectOrchestrator.run('codify', reporter, false, async (connectionCode: string , server: Server) => {
        expect(connectionCode).to.be.a('string');
        server.close();
        done();
      })
    })
  });

  it('It will ask for a login if the user is not logged in', async () => {
    const reporter = new MockReporter({});
    await fakeLogout();

    const loginRunSpy = vi.spyOn(LoginOrchestrator, 'run');
    config.connectServerPort = Math.floor(Math.random() * 10000)

    await new Promise<void>((done) => {
      ConnectOrchestrator.run('codify', reporter, false, async (connectionCode: string, server: Server) => {
        expect(connectionCode).to.be.a('string');
        expect(loginRunSpy).toHaveBeenCalledOnce();

        server.close();
        done();
      })
    });
  });

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  afterEach(async () => {
    await wait(200);
    vi.resetAllMocks();
    MockOs.reset();
  })

  function checkPortStatus(port: number, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      socket.once('connect', () => {
        // If 'connect' event fires, the port is open and listening
        socket.destroy();
        resolve(true); // Port is in use
      });

      socket.once('error', (err) => {
        // Any error typically means the port is not listening
        // EADDRNOTAVAIL, ECONNREFUSED, etc.
        reject(err); // Port is likely free or unreachable
      });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error('Connection attempt timed out'));
      });

      socket.connect(port, host);
    });
  }

}, { sequential: true })
