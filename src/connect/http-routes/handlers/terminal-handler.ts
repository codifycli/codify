import { ConnectCommand, createCommandHandler } from './create-command.js';

export function terminalHandler() {
  return createCommandHandler({
    name: ConnectCommand.TERMINAL,
    command: [],
  })
}
