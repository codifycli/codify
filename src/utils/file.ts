import * as fs from 'node:fs/promises';
import * as os from 'node:os';

export async function createStartupShellScriptsIfNotExists(): Promise<void> {
  // TODO: Support bash in the future
  const open = await fs.open(`${os.homedir}/.zshrc`, 'a');
  await open.close();
}
