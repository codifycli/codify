import { IpcMessageV2, MessageStatus } from 'codify-schemas';
import { nanoid } from 'nanoid'

export class IpcMessageWrapper implements IpcMessageV2 {
  cmd!: string;
  requestId!: string;
  status?: MessageStatus | undefined;
  data!: unknown;

  constructor(ipcMessage: IpcMessageV2) {
    Object.assign(this, ipcMessage);
  }

  static create(cmd: string, data: any): IpcMessageWrapper {
    const requestId = nanoid();

    return new IpcMessageWrapper({
      cmd,
      data,
      requestId
    })
  }

  isSameRequest(message: IpcMessageV2): boolean {
    return message.requestId === this.requestId;
  }
}
