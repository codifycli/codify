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
import { Reporter } from '../../../src/ui/reporters/reporter.js';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';

vi.mock(import('../../../src/orchestrators/login'), async () => {
  return {
    LoginOrchestrator: {
      run: async () => {
      }
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
describe('Connect server tests', () => {
  beforeEach(() => {
    vol.reset();
  })

  it('Multiple clients can connect to the WebSocket server', async () => {
    const reporter = new MockReporter();
    await fakeLogin();

    await new Promise<void>((done, reject) => {
      startServer(reporter, async (connectionCode, clientId, server) => {
        try {
          const socket = new WebSocket(`ws://localhost:${config.connectServerPort}/ws`, [connectionCode]);
          socket.onopen = () => {
            console.log('Connected 2');

            server.close()
            done();
          }
        } catch (e) {
          reject(e)
        }
      });
    });
  });

  it('Will not create initial connection on the wrong connection code', async () => {
    const reporter = new MockReporter();
    await fakeLogin();

    await new Promise<void>((done) => {
      ConnectOrchestrator.run('codify', reporter, false, async (connectionCode: string, server: Server) => {
        expect(connectionCode).to.be.a('string');

        try {
          const socket = new WebSocket(`ws://localhost:${config.connectServerPort}/ws`, ['random code']);
        } catch (e) {
          expect(e.message).to.contain('Invalid Sec-WebSocket-Protocol value')
          server.close();
          done();
        }
      });
    });
  });

  it('Will not allow a new session on the wrong code', async () => {
    const reporter = new MockReporter();
    await fakeLogin();

    await new Promise<void>((done, reject) => {
      startServer(reporter, async (connectionCode, clientId, server) => {
        try {
          const sessionResponse = await fetch(`http://localhost:${config.connectServerPort}/session`, {
            method: 'POST',
            headers: { 'Authorization': 'random-code', 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId })
          });

          expect(sessionResponse.ok).to.be.false;

          server.close();
          done();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('Will not allow a new command on the wrong code', async () => {
    const reporter = new MockReporter();
    await fakeLogin();

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/plan/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': 'random-code', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: [
                {
                  type: 'homebrew',
                  formulae: ['zsh']
                }
              ]
            })
          });

          expect(commandResponse.ok).to.be.false;

          server.close();
          done();
        } catch (e) {
          reject(e)
        }
      });
    });
  });

  it('Can handle a new action session (terminal)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();

    await new Promise<void>((done, reject) => {
      startServer(reporter, async (connectionCode, clientId, server) => {
        try {
          const sessionResponse = await fetch(`http://localhost:${config.connectServerPort}/session`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId })
          });

          expect(sessionResponse.ok).to.be.true;
          const { sessionId } = await sessionResponse.json();
          expect(sessionId).to.be.a('string');

          const socket = new WebSocket(`ws://localhost:${config.connectServerPort}/ws/session/${sessionId}`, [connectionCode]);

          socket.onmessage = (message) => {
            expect(message).to.not.be.null;
          }

          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/terminal/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
          });

          expect(commandResponse.ok).to.be.true;
          server.close();
          done();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('Can handle a new action session (plan)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();
    await mkdir(os.tmpdir(), { recursive: true });

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/plan/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: [
                {
                  type: 'homebrew',
                  formulae: ['zsh']
                }
              ]
            })
          });

          expect(commandResponse.ok).to.be.true;

          server.close();
          done();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('Can handle a new action session (apply)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();
    await mkdir(os.tmpdir(), { recursive: true });

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/apply/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: [
                {
                  type: 'homebrew',
                  formulae: ['zsh']
                }
              ]
            })
          });

          expect(commandResponse.ok).to.be.true;

          server.close();
          done();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('Can handle a new action session (import specific)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();
    await mkdir(os.tmpdir(), { recursive: true });

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/import/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'import_specific',
              resourceTypes: ['pyenv'],
              config: [
                {
                  type: 'homebrew',
                  formulae: ['zsh']
                }
              ]
            })
          });

          console.log(await commandResponse.text());
          expect(commandResponse.ok).to.be.true;

          server.close();
          done();
        } catch(e) {
          reject(e);
        }
      });
    });
  });

  it('Can handle a new action session (import all)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();
    await mkdir(os.tmpdir(), { recursive: true });

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/import/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'import',
              config: [
                {
                  type: 'homebrew',
                  formulae: ['zsh']
                }
              ]
            })
          });

          expect(commandResponse.ok).to.be.true;

          server.close();
          done();
        } catch(e) {
          reject(e);
        }
      });
    });
  });

  it('Can handle a new action session (refresh specific)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();
    await mkdir(os.tmpdir(), { recursive: true });

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/refresh/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'refresh_specific',
              resourceTypes: ['homebrew'],
              config: [
                {
                  type: 'homebrew',
                  formulae: ['zsh']
                }
              ]
            })
          });

          expect(commandResponse.ok).to.be.true;

          server.close();
          done();
        } catch(e) {
          reject(e);
        }
      });
    });
  });

  it('Can handle a new action session (refresh all)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();
    await mkdir(os.tmpdir(), { recursive: true });

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/refresh/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'refresh',
              config: [
                {
                  type: 'homebrew',
                  formulae: ['zsh']
                }
              ]
            })
          });

          expect(commandResponse.ok).to.be.true;

          server.close();
          done();
        } catch(e) {
          reject(e);
        }
      });
    });
  });

  it('Can handle a new action session (init)', async () => {
    const reporter = new MockReporter();
    await fakeLogin();
    await mkdir(os.tmpdir(), { recursive: true });

    await new Promise<void>((done, reject) => {
      startSession(reporter, async (connectionCode, clientId, server, socket, sessionId) => {
        try {
          const commandResponse = await fetch(`http://localhost:${config.connectServerPort}/init/${sessionId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
          });

          expect(commandResponse.ok).to.be.true;

          server.close();
          done();
        } catch(e) {
          reject(e);
        }
      });
    });
  });

  afterEach(() => {

    vi.resetAllMocks();
    MockOs.reset();
  })

  function startServer(reporter: Reporter, onOpen: (connectionCode: string, clientId: string, server: Server) => void) {
    config.connectServerPort = Math.floor(Math.random() * 10000)

    ConnectOrchestrator.run('codify', reporter, false, async (connectionCode: string, server: Server) => {
      expect(connectionCode).to.be.a('string');

      const socket = new WebSocket(`ws://localhost:${config.connectServerPort}/ws`, [connectionCode]);
      socket.onopen = () => {
        console.log('Connected');

        // Every time a connection is opened, expect the opened message with info about the connection.
        socket.onmessage = (event) => {
          const messageData = JSON.parse(event.data);

          // We want to check if the open event happens. This event provides the client with their client Id to identify themselves in
          // subsequent calls
          if (messageData.key === 'opened') {
            expect(messageData).toMatchObject({
              key: 'opened',
              data: { clientId: expect.any(String), startTimestamp: expect.any(String) }
            });

            onOpen(connectionCode, messageData.data.clientId, server);
          }
        }
      }
    })
  }

  function startSession(reporter: Reporter, onOpen: (connectionCode: string, clientId: string, server: Server, socket: WebSocket, sessionId: string) => void) {
    startServer(reporter, async (connectionCode, clientId, server) => {
      const sessionResponse = await fetch(`http://localhost:${config.connectServerPort}/session`, {
        method: 'POST',
        headers: { 'Authorization': `${connectionCode}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });

      expect(sessionResponse.ok).to.be.true;
      const { sessionId } = await sessionResponse.json();
      expect(sessionId).to.be.a('string');

      const socket = new WebSocket(`ws://localhost:${config.connectServerPort}/ws/session/${sessionId}`, [connectionCode]);

      socket.onmessage = (message) => {
        expect(message).to.not.be.null;
      }

      onOpen(connectionCode, clientId, server, socket, sessionId);
    })
  }
})
