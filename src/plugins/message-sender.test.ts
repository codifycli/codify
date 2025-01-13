import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'stream';
import { describe, expect, it } from 'vitest';
import { returnMessageCmd } from './plugin-process.js';
import { clearInterval, clearTimeout } from 'node:timers';
import { sendIpcMessageForResult } from './message-sender';
import { PluginMessage } from './plugin-message.js';

describe('Message sender tests', async () => {
  const mockChildProcess = () => {
    const process = new ChildProcess();
    process.stdout = new EventEmitter() as Readable;
    process.stderr = new EventEmitter() as Readable
    process.send = () => true;

    return process;
  }

  it('Is able to send a message and await a result', async () => {
    const cProcess = mockChildProcess();
    const message = PluginMessage.create('message1', null)

    const result = await Promise.all([
      sendIpcMessageForResult(message, cProcess),
      setTimeout(() => {
        cProcess.emit('message', { cmd: returnMessageCmd('message1'), data: null, requestId: message.requestId });
      }, 100),
    ])

    expect(result[0]).toMatchObject({
      cmd: returnMessageCmd('message1')
    })
  })

  it('Clears all listeners', async () => {
    const cProcess = mockChildProcess();
    const message = PluginMessage.create('message1', null)

    const result = await Promise.all([
      sendIpcMessageForResult(message, cProcess),
      setTimeout(() => {
        cProcess.emit('message', { cmd: returnMessageCmd('message1'), data: null, requestId: message.requestId });
      }, 100),
    ])

    expect(cProcess.listenerCount('messsage')).to.eq(0);
    expect(cProcess.stdout!.listenerCount('data')).to.eq(0);
    expect(cProcess.stderr!.listenerCount('data')).to.eq(0);
  })

  it('Is able to send a message and timeout if not received', async () => {
    const cProcess = mockChildProcess();
    const message = PluginMessage.create('message1', null)

    await expect(() => Promise.all([
      sendIpcMessageForResult(message, cProcess, 100),
      setTimeout(() => {
        cProcess.emit('message', { cmd: returnMessageCmd('message1'), data: null, requestId: message.requestId });
      }, 200),
    ])).rejects.toThrowError();
  })

  it('Is able to send a message and not timeout if stdout is returned', async () => {
    const cProcess = mockChildProcess();
    const message = PluginMessage.create('message1', null)

    // Explanation:
    //   1. Send a message and set the timeout to be 100ms
    //   2. Make the return message come back in 200ms
    //   3. Periodically send a stdout every 50ms. This should not throw
    const [result, timer, interval] = await Promise.all([
      sendIpcMessageForResult(message, cProcess, 100),
      setTimeout(() => {
        cProcess.emit('message', { cmd: returnMessageCmd('message1'), data: null, requestId: message.requestId });
      }, 200),
      setInterval(() => {
        cProcess.stdout!.emit('data', 'message');
      }, 50),
    ])

    clearInterval(interval);
    clearTimeout(timer);
    expect(result).toMatchObject({
      cmd: returnMessageCmd('message1')
    })
  })

  it('Is able to send a message and not timeout if stderr is returned', async () => {
    const cProcess = mockChildProcess();
    const message = PluginMessage.create('message1', null)

    // Explanation:
    //   1. Send a message and set the timeout to be 100ms
    //   2. Make the return message come back in 200ms
    //   3. Periodically send a stdout every 50ms. This should not throw
    const [result, timer, interval] = await Promise.all([
      sendIpcMessageForResult(message, cProcess, 100),
      setTimeout(() => {
        cProcess.emit('message', { cmd: returnMessageCmd('message1'), data: null, requestId: message.requestId });
      }, 200),
      setInterval(() => {
        cProcess.stderr!.emit('data', 'message');
      }, 50),
    ])

    clearInterval(interval);
    clearTimeout(timer);
    expect(result).toMatchObject({
      cmd: returnMessageCmd('message1')
    })
  })

  it('Is able to send a message and not timeout if a non-resolving message is sent (like a sudo request)', async () => {
    const cProcess = mockChildProcess();
    const message = PluginMessage.create('message1', null)

    // Explanation:
    //   1. Send a message and set the timeout to be 100ms
    //   2. Make the return message come back in 200ms
    //   3. Periodically send a stdout every 50ms. This should not throw
    const [result, timer, interval] = await Promise.all([
      sendIpcMessageForResult(message, cProcess, 100),
      setTimeout(() => {
        cProcess.emit('message', { cmd: returnMessageCmd('message1'), data: null, requestId: message.requestId });
      }, 200),
      setInterval(() => {
        cProcess.emit('message', { cmd: 'non-resolving', data: null, requestId: 'dshghdjsag' })
      }, 50),
    ])

    clearInterval(interval);
    clearTimeout(timer);
    expect(result).toMatchObject({
      cmd: returnMessageCmd('message1')
    })
  })

});
