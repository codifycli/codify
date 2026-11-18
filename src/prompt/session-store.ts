import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export function sessionsDir(): string {
  return path.join(os.homedir(), '.codify', 'sessions');
}

/**
 * Ephemeral configs proposed by the agent are written to ~/.codify/sessions/<threadId>/ so plan/apply can run on a
 * real file and the user can find them again later (nothing is written into their project files). Each call to
 * codify_plan or codify_apply gets the next numbered file.
 */
export const SessionStore = {
  dir(threadId: string): string {
    return path.join(sessionsDir(), sanitize(threadId));
  },

  async writeConfig(threadId: string, config: string): Promise<string> {
    const dir = this.dir(threadId);
    await fs.mkdir(dir, { recursive: true });

    const existing = await fs.readdir(dir).catch(() => [] as string[]);
    const next = existing
      .map((name) => /^(\d+)\.codify\.jsonc$/.exec(name)?.[1])
      .filter((n): n is string => n !== undefined)
      .reduce((max, n) => Math.max(max, Number(n)), 0) + 1;

    const filePath = path.join(dir, `${String(next).padStart(3, '0')}.codify.jsonc`);
    await fs.writeFile(filePath, config.endsWith('\n') ? config : `${config}\n`, 'utf8');
    return filePath;
  },
};

// Thread ids come from the server; never let one escape the sessions directory
function sanitize(id: string): string {
  const cleaned = id.replaceAll(/[^\w-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'unknown';
}
