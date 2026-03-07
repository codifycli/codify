import { IpcMessageV2, MessageStatus } from '@codifycli/schemas';
import { nanoid } from 'nanoid'

import { ipcMessageValidator } from './plugin-process.js';

export class PluginMessage implements IpcMessageV2 {
  cmd!: string;
  requestId!: string;
  status?: MessageStatus | undefined;
  data!: unknown;

  constructor(ipcMessage: IpcMessageV2) {
    Object.assign(this, ipcMessage);
  }
  
  static fromUnknown(ipcMessage: unknown): PluginMessage | null {
    if(!ipcMessageValidator(ipcMessage)) {
      return null;
    }
    
    return new PluginMessage(ipcMessage as unknown as IpcMessageV2);
  }

  static create(cmd: string, data: any): PluginMessage {
    const requestId = nanoid();

    return new PluginMessage({
      cmd,
      data,
      requestId
    })
  }

  isSameRequest(message: IpcMessageV2): boolean {
    return message.requestId === this.requestId;
  }
  
  isSuccessful(): boolean {
    return this.status === MessageStatus.SUCCESS;
  }
}
