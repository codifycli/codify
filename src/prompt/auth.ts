import { decodeJwt } from 'jose';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';

export interface AgentAuth {
  token: string;
  userId: string;
  isAnonymous: boolean;
}

interface AnonymousSession {
  accessToken: string;
  refreshToken: string;
  /** Seconds since epoch */
  expiresAt: number;
  userId: string;
}

// Refresh a little before the access token actually expires
const EXPIRY_MARGIN_SECONDS = 60;

export function anonymousSessionPath(): string {
  return path.join(os.homedir(), '.codify', 'anonymous-session.json');
}

/**
 * Credentials for talking to the Codify agent.
 *
 * Logged-in users (`codify login`) use their long-lived CLI token. Everyone else gets a Supabase anonymous session,
 * which the agent server allows a handful of free prompts. The anonymous session is stored in
 * ~/.codify/anonymous-session.json and refreshed when it expires, so the free allowance follows the same anonymous
 * user across runs.
 */
export const PromptAuth = {
  async get(): Promise<AgentAuth> {
    const login = await LoginHelper.load();
    if (login.isLoggedIn && login.credentials) {
      return { token: login.credentials.accessToken, userId: login.credentials.userId, isAnonymous: false };
    }

    const session = await this.getAnonymousSession();
    return { token: session.accessToken, userId: session.userId, isAnonymous: true };
  },

  async getAnonymousSession(now = Date.now() / 1000): Promise<AnonymousSession> {
    const existing = await readAnonymousSession();
    if (existing && existing.expiresAt - EXPIRY_MARGIN_SECONDS > now) {
      return existing;
    }

    if (existing) {
      try {
        return await saveAnonymousSession(await requestSession(
          '/token?grant_type=refresh_token',
          { refresh_token: existing.refreshToken },
        ));
      } catch {
        // The refresh token can expire or be revoked; fall through and start a new anonymous session.
      }
    }

    return saveAnonymousSession(await requestSession('/signup', { data: {} }));
  },
};

async function readAnonymousSession(): Promise<AnonymousSession | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(anonymousSessionPath(), 'utf8'));
    if (typeof parsed?.accessToken === 'string' && typeof parsed?.refreshToken === 'string') {
      return parsed as AnonymousSession;
    }
  } catch {
    // Missing or unreadable: create a new session
  }

  return undefined;
}

async function saveAnonymousSession(session: AnonymousSession): Promise<AnonymousSession> {
  const filePath = anonymousSessionPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session), { mode: 0o600 });
  return session;
}

async function requestSession(endpoint: string, body: object): Promise<AnonymousSession> {
  const res = await fetch(`${config.supabaseUrl}/auth/v1${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Unable to start a Codify session (${res.status}): ${await res.text()}`);
  }

  const json = await res.json() as { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number };
  const claims = decodeJwt(json.access_token);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at ?? claims.exp ?? (Date.now() / 1000) + (json.expires_in ?? 3600),
    userId: claims.sub!,
  };
}
