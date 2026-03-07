import { fork } from 'node:child_process';
import { type Readable } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';

import { PluginProcess, returnMessageCmd } from '../../src/plugins/plugin-process.js';
import { MessageCmd, MessageStatus, SpawnStatus } from '@codifycli/schemas';
import { ctx } from '../../src/events/context.js';

vi.mock('node:child_process', async () => {
  const { ChildProcess } = await import('node:child_process');
  const { EventEmitter } = await import('node:events');

  const process = new ChildProcess();
  process.stdout = new EventEmitter() as Readable;
  process.stderr = new EventEmitter() as Readable
  process.send = () => true;

  return { fork: () => process };
})

describe('Message sender tests', async () => {
  it('Is able to send a message and await a result', async () => {
    // Uses the child process from the mocks
    const mockChildProcess = fork('');

    const commandRequestedSpy = vi.spyOn(ctx, 'commandRequested');
    const processSpy = vi.spyOn(mockChildProcess, 'send');

    const plugin = await PluginProcess.start('', 'TestPlugin', false);

    mockChildProcess.emit('message', { cmd: MessageCmd.COMMAND_REQUEST, data: { command: 'sudo something', options: { requiresRoot: true } }, requestId: 'requestId' })
    expect(commandRequestedSpy).toHaveBeenCalledOnce();

    ctx.commandRequestCompleted('TestPlugin', { status: SpawnStatus.SUCCESS, data: 'success', exitCode: 0 })
    expect(processSpy).to.be.lastCalledWith({
      cmd: returnMessageCmd(MessageCmd.COMMAND_REQUEST),
      requestId: 'requestId',
      data: expect.objectContaining({
        status: MessageStatus.SUCCESS,
        data: 'success',
      })
    });
  })
});
