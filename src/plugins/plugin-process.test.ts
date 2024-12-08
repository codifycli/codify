import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { ChildProcess } from 'node:child_process';

import { Readable } from 'stream';
import { PluginProcess } from './plugin-process.js';
import { mock } from 'node:test';
import * as chaiAsPromised from 'chai-as-promised';

describe('Plugin IPC Bridge tests', async () => {

  const mockChildProcess = () => {
    const process = new ChildProcess();
    process.stdout = new EventEmitter() as Readable;
    process.stderr = new EventEmitter() as Readable
    process.send = () => true;

    return process;
  }

  it('send a message', async () => {
    const process = mockChildProcess();
    const sendMock = mock.method(process, 'send');

    const ipcBridge = new PluginProcess(process);
    ipcBridge.sendMessage({ cmd: 'message', data: 'data' })

    expect(sendMock.mock.calls.length).to.eq(1);
    expect(sendMock.mock.calls[0].arguments[0]).to.deep.eq({ cmd: 'message', data: 'data' });
  })

  it('send a message and receives the response', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginProcess(process);

    const [result] = await Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
      setTimeout(() => process.emit('message', { cmd: 'message_Response', data: 'data' }), 50),
    ]);

    expect(result).toMatchObject({
      "cmd": "message_Response",
      "data": "data",
    });
  });

  it('validates bad responses', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginProcess(process);

    await expect(async () => Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message_Response', data: 'data' }),
        setTimeout(() => process.emit('message', 'data'), 50),
      ])
    ).rejects.toThrow()
  });

  it('does not leave additional listeners', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginProcess(process);

    // NodeJS promise.all is executed in order
    await Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
      setTimeout(() => expect(process.listeners('message').length).to.eq(1), 25),
      setTimeout(() => process.emit('message', { cmd: 'message_Response', data: 'data' }), 50),
    ]);

    expect(process.listeners('message').length).to.eq(0);
    expect(process.stdout!.listeners('data').length).to.eq(0);
    expect(process.stderr!.listeners('data').length).to.eq(0);
  });

  it('does not interfere with existing listeners', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginProcess(process);
    process.on('message', () => {})

    await Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
      setTimeout(() => expect(process.listeners('message').length).to.eq(2), 25),
      setTimeout(() =>process.emit('message', { cmd: 'message_Response', data: 'data' }), 50),
    ]);

    expect(process.listeners('message').length).to.eq(1);
  });

  it('allows new listeners to be added while waiting for the result', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginProcess(process);

    await Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
      setTimeout(() => {
        process.on('message', () => {})
        expect(process.listeners('message').length).to.eq(2)
      }, 25),
      setTimeout(() => process.emit('message', { cmd: 'message_Response', data: 'data' }), 50),
    ]);

    expect(process.listeners('message').length).to.eq(1);
  });
});
