import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

import { ctx } from '../events/context.js';

/**
 * Opens a URL or file with the default application (`open` on macOS, `xdg-open` on Linux, the Windows shell from WSL).
 * Never throws: resolves false if the opener couldn't be started (the callers also print the URL).
 */
export default function open(target: string): Promise<boolean> {
  const [command, args] = opener(target);

  return new Promise((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', (error) => {
      ctx.debug(`Unable to open ${target} with ${command}: ${error.message}`);
      resolve(false);
    });
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

function opener(target: string): [string, string[]] {
  if (process.platform === 'darwin') {
    return ['open', [target]];
  }

  if (isWsl()) {
    // Encoded so the target is never interpreted by a shell
    const script = `Start-Process '${target.replaceAll('\'', '\'\'')}'`;
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]];
  }

  return ['xdg-open', [target]];
}

function isWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }

  if (os.release().toLowerCase().includes('microsoft')) {
    return true;
  }

  try {
    return readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}
