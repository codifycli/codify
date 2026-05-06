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
import { EditOrchestrator } from '../../../src/orchestrators/edit';

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

vi.mock('../../../src/utils/desktop-installer.js', () => ({
  getDesktopAppPath: vi.fn(async () => null),
  getDesktopDownloadUrl: vi.fn(() => null),
  installDesktopApp: vi.fn(async () => {}),
}))

// The apply orchestrator directly calls plan so this will test both
describe('Edit orchestrator tests', () => {
  beforeEach(() => {
    vol.reset();
  })

  it('It will start a local server on config.connectServerPort', async () => {
    const reporter = new MockReporter();
    await fakeLogin();

    const openSpy = vi.spyOn(open, 'default');
    EditOrchestrator.run('codify', reporter);

    await expect.poll(async () => {
      return checkPortStatus(config.connectServerPort);
    }, {
      timeout: 4000,
    }).toBeTruthy()
  });


  afterEach(() => {
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

})
