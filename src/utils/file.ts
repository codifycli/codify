import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';

export async function createStartupShellScriptsIfNotExists(): Promise<void> {
  // TODO: Support bash in the future
  const open = await fs.open(`${os.homedir}/.zshrc`, 'a');
  await open.close();
}

export class FileUtils {
  static async fileExists(filePath: string, throwIfExistsButNotFile = true): Promise<boolean> {
    try {
      const result = await fs.lstat(path.resolve(filePath))
      if (throwIfExistsButNotFile && !result.isFile()) {
        throw new Error(`Dir found at ${filePath} instead of a file`)
      }

      return true;
    } catch(e) {
      return false;
    }
  }
}
