import { describe, it } from 'mocha';
import { EventEmitter } from 'node:events';
import { ChildProcess } from 'node:child_process';

import { Readable } from 'stream';
import { PluginIpcBridge } from './ipc-bridge.js';
import { mock } from 'node:test';
import { expect } from '@oclif/test';
import * as chai from 'chai';
import { AssertionError } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

describe('Plugin IPC Bridge tests', async () => {

  before(() => {
    chai.use(chaiAsPromised as any);
    chai.should();
  })

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

    const ipcBridge = new PluginIpcBridge(process);
    ipcBridge.sendMessage({ cmd: 'message', data: 'data' })

    expect(sendMock.mock.calls.length).to.eq(1);
    expect(sendMock.mock.calls[0].arguments[0]).to.deep.eq({ cmd: 'message', data: 'data' });
  })

  it('send a message and receives the response', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginIpcBridge(process);

    try {
      await Promise.all([
        expect(ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' })).to.eventually.eq('data'),
        process.emit('message', { cmd: 'messageResult', data: 'data' }),
      ]);
    } catch (e) {
      throw new AssertionError('Failed to receive message');
    }
  });

  it('validates bad responses', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginIpcBridge(process);

    try {
      await Promise.all([
        ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
        process.emit('message', 'data'),
      ]);
    } catch (e) {
      expect(e).to.throw
    }
  });

  it('does not leave additional listeners', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginIpcBridge(process);

    // NodeJS promise.all is executed in order
    await Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
      expect(process.listeners('message').length).to.eq(1),
      process.emit('message', { cmd: 'messageResult', data: 'data' }),
      expect(process.listeners('message').length).to.eq(0),
      expect(process.stdout!.listeners('data').length).to.eq(0),
      expect(process.stderr!.listeners('data').length).to.eq(0),
    ]);
  });

  it('does not interfere with existing listeners', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginIpcBridge(process);
    process.on('message', () => {
    })

    await Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
      expect(process.listeners('message').length).to.eq(2),
      process.emit('message', { cmd: 'messageResult', data: 'data' }),
      expect(process.listeners('message').length).to.eq(1),
    ]);
  });

  it('allows new listeners to be added while waiting for the result', async () => {
    const process = mockChildProcess();
    const ipcBridge = new PluginIpcBridge(process);

    await Promise.all([
      ipcBridge.sendMessageForResult({ cmd: 'message', data: 'data' }),
      process.on('message', () => {
      }),
      expect(process.listeners('message').length).to.eq(2),
      process.emit('message', { cmd: 'messageResult', data: 'data' }),
      expect(process.listeners('message').length).to.eq(1),
    ]);
  });
});
