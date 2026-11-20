import { config } from '../../config.js';
import { LoginHelper } from '../../connect/login-helper.js';
import { type SavedReference, savedKey } from '../../variables/saved-references.js';

export interface ResolvedSavedValues {
  // By key. Ex: { 'secrets.user.GITHUB_TOKEN': '...' }
  values: Map<string, string>;
  // Keys of the values that are secrets
  secretKeys: Set<string>;
}

/**
 * Saved variables and secrets (Codify dashboard: Settings › Variables & Secrets), read with the CLI's login. The
 * database only returns the entries the user may use (personal entries, the entries of their organization, and the
 * secrets of documents they can edit).
 */
export const SavedValuesClient = {
  get isLoggedIn(): boolean {
    return Boolean(LoginHelper.get()?.isLoggedIn && LoginHelper.get()?.credentials?.accessToken);
  },

  /**
   * The values of the references. References that don't exist (or that the user can't use) are left out.
   * @param documentId the dashboard document being run. Needed for `secrets.file.*`.
   */
  async resolve(references: SavedReference[], documentId?: string): Promise<ResolvedSavedValues> {
    const rows = await request<Array<{ ref_kind: SavedReference['kind']; ref_name: string; ref_scope: SavedReference['scope']; ref_value: string }>>(
      'rpc/resolve_variables',
      {
        method: 'POST',
        body: JSON.stringify({
          // eslint-disable-next-line camelcase
          p_document_id: documentId ?? null,
          // eslint-disable-next-line camelcase
          p_refs: references.map(({ kind, name, scope }) => ({ kind, name, scope })),
        }),
      },
    );

    const values = new Map<string, string>();
    const secretKeys = new Set<string>();
    for (const row of rows ?? []) {
      const key = savedKey(row.ref_kind, row.ref_scope, row.ref_name);
      values.set(key, row.ref_value);
      if (row.ref_kind === 'secret') {
        secretKeys.add(key);
      }
    }

    return { values, secretKeys };
  },

  /** The keys of every entry the user can use (names only, never values). Used to suggest a fix for a typo. */
  async listKeys(): Promise<string[]> {
    const rows = await request<Array<{ kind: SavedReference['kind']; name: string; scope: SavedReference['scope'] }>>(
      'variables?select=kind,scope,name',
      { method: 'GET' },
    );

    return (rows ?? []).map((r) => savedKey(r.kind, r.scope, r.name));
  },
};

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const token = LoginHelper.get()?.credentials?.accessToken;
  if (!token) {
    throw new Error('Not logged in');
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.supabasePublishableKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load saved variables and secrets (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as T;
}
