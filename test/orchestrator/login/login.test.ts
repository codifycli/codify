import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { MockReporter } from '../mocks/reporter.js';
import * as net from 'node:net';
import { config } from '../../../src/config.js';
import { fakeLogout } from '../mocks/mock-login';
import * as open from 'open'
import { LoginOrchestrator } from '../../../src/orchestrators/login';
import { vol } from 'memfs';
import { LoginHelper } from '../../../src/connect/login-helper';

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

const tempJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30'

// The apply orchestrator directly calls plan so this will test both
describe('Login orchestrator tests', () => {
  beforeEach(() => {
    vol.reset();
  })

  it('It can save a successful login', async () => {
    await fakeLogout();
    expect(LoginHelper.get().isLoggedIn).to.be.false;

    const openSpy = vi.spyOn(open, 'default');
    LoginOrchestrator.run();

    await expect.poll(async () => {
      return checkPortStatus(config.loginServerPort);
    }, {}).toBeTruthy()

    expect(openSpy).toBeCalledWith('https://dashboard.codifycli.com/auth/cli');

    const saveResponse = await fetch(`http://localhost:${config.loginServerPort}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: tempJWT,
      })
    })

    expect(saveResponse.ok).to.be.true;
    expect(LoginHelper.get().isLoggedIn).to.be.true;
    expect(LoginHelper.get().credentials).toMatchObject({
      accessToken: tempJWT,
    })

    expect(() => checkPortStatus(config.loginServerPort)).to.throw
  });

  it('It will login via credentials (wrong credentials)', async () => {
    await fakeLogout();
    expect(LoginHelper.get().isLoggedIn).to.be.false;

    expect(async () => await LoginOrchestrator.run({
      username: 'my-user',
      password: 'password'
    })).to.throw;

    expect(LoginHelper.get().isLoggedIn).to.be.false;
  });

  it('It will login via credentials (correct credentials)', async () => {
    await fakeLogout();
    expect(LoginHelper.get().isLoggedIn).to.be.false;

    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ accessToken: tempJWT })
    }))

    const fetchSpy = vi.spyOn(global, 'fetch');

    await LoginOrchestrator.run({
      username: 'my-user',
      password: 'password'
    })

    expect(fetchSpy).toHaveBeenCalledWith(`${config.dashboardUrl}/api/v1/auth/cli`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          email: 'my-user',
          password: 'password',
        })
      })
    expect(LoginHelper.get().isLoggedIn).to.be.true;
    expect(LoginHelper.get().credentials).toMatchObject({
      accessToken: tempJWT,
    })
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
