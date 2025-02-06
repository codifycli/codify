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

  static async isDir(fileOrDir: string): Promise<boolean> {
    const lstat = await fs.lstat(path.resolve(fileOrDir))
    return lstat.isDirectory()
  }

  static async readFile(filePath: string): Promise<string | undefined> {
    const resolvedPath = path.resolve(filePath);
    return fs.readFile(resolvedPath, 'utf8')
  }

  static async writeFile(filePath: string, contents: string): Promise<void> {
    const resolvedPath = path.resolve(filePath);
    await fs.writeFile(resolvedPath, contents, 'utf8')
  }
}
