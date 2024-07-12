import { Command, execute } from '@oclif/core';

import Apply from './commands/apply/index.js'
import Plan from './commands/plan/index.js'
import Uninstall from './commands/uninstall.js'

export const COMMANDS: Record<string, Command.Class> = {
  apply: Apply,
  plan: Plan,
  uninstall: Uninstall,
}

export async function run() {
  await execute({ dir: import.meta.url })
}
