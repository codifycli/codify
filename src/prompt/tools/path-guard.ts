import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Paths the agent may never read, even though the tools are read-only: anything it reads is sent to the model
 * provider. Matched against the real path (symlinks resolved), relative to the home directory where applicable.
 */
const BLOCKED_HOME_PATHS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.config/gcloud',
  '.config/gh/hosts.yml',
  '.kube/config',
  '.docker/config.json',
  '.netrc',
  '.npmrc',
  '.pypirc',
  '.git-credentials',
  '.codify/credentials.json',
  '.codify/anonymous-session.json',
  'Library/Keychains',
  'Library/Cookies',
  '.password-store',
];

const BLOCKED_BASENAME_PATTERNS = [
  /^\.env(\..*)?$/, // .env, .env.local, ...
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /^\.?credentials(\.json)?$/i,
  /^secrets?\.(json|ya?ml|toml)$/i,
];

const BLOCKED_ABSOLUTE_PATHS = ['/etc/shadow', '/etc/sudoers', '/etc/master.passwd'];

export class BlockedPathError extends Error {
  constructor(public readonly requestedPath: string) {
    super(`Access to ${requestedPath} is blocked: it may contain secrets.`);
  }
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function isBlockedPath(absolutePath: string): boolean {
  const normalized = path.resolve(absolutePath);
  const home = os.homedir();

  if (BLOCKED_ABSOLUTE_PATHS.some((blocked) => normalized === blocked || normalized.startsWith(blocked + path.sep))) {
    return true;
  }

  if (normalized.startsWith(home + path.sep)) {
    const relative = path.relative(home, normalized);
    if (BLOCKED_HOME_PATHS.some((blocked) => relative === blocked || relative.startsWith(blocked + path.sep))) {
      return true;
    }
  }

  return BLOCKED_BASENAME_PATTERNS.some((pattern) => pattern.test(path.basename(normalized)));
}

/**
 * Resolve a user/agent supplied path to an absolute real path and refuse blocked ones. Symlinks are resolved so a
 * link pointing into ~/.ssh is blocked too. A path that doesn't exist is checked as given (the caller reports the
 * missing file).
 */
export async function resolveAllowedPath(requested: string): Promise<string> {
  const absolute = path.resolve(expandHome(requested));
  if (isBlockedPath(absolute)) {
    throw new BlockedPathError(requested);
  }

  const real = await fs.realpath(absolute).catch(() => absolute);
  if (isBlockedPath(real)) {
    throw new BlockedPathError(requested);
  }

  return real;
}
