import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Kills the processes listening on a TCP port (macOS and Linux, uses lsof). */
export async function killPort(port: number): Promise<void> {
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('Invalid port number provided');
  }

  let stdout = '';
  try {
    ({ stdout } = await execFileAsync('lsof', ['-t', '-i', `tcp:${port}`, '-s', 'tcp:listen']));
  } catch (error) {
    // lsof exits with 1 when nothing matches
    if ((error as { code?: number }).code !== 1) {
      throw error;
    }
  }

  const pids = [...new Set(stdout.split(/\s+/).filter(Boolean).map(Number))];
  if (pids.length === 0) {
    throw new Error('No process running on port');
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone
    }
  }
}
