/**
 * References to saved variables and secrets (managed in the Codify dashboard: Settings › Variables & Secrets):
 *
 *   ${{ vars.user.NAME }}      personal variable        (each user uses their own value)
 *   ${{ vars.org.NAME }}       organization variable
 *   ${{ secrets.user.NAME }}   personal secret
 *   ${{ secrets.org.NAME }}    organization secret
 *   ${{ secrets.file.NAME }}   secret of a dashboard document (its editors)
 *
 * They are resolved by the CLI right before a run (`resolve_variables`) and are only allowed in the config being run,
 * never in templates. Templates get them through their `variables`.
 */

export type SavedKind = 'secret' | 'variable';
export type SavedScope = 'document' | 'organization' | 'user';

export interface SavedReference {
  kind: SavedKind;
  scope: SavedScope;
  name: string;
  // The text between the braces. Ex: secrets.user.GITHUB_TOKEN
  key: string;
}

/** The pattern of a saved reference key (no anchors, no groups). Used inside the ${{ }} reference pattern. */
export const SAVED_KEY_PATTERN = String.raw`(?:vars|secrets)\.(?:user|org|file)\.[A-Za-z_][A-Za-z0-9_]*`;

const KEY_REGEX = /^(vars|secrets)\.(user|org|file)\.([A-Za-z_][A-Za-z0-9_]*)$/u;
const SCOPES: Record<string, SavedScope> = { file: 'document', org: 'organization', user: 'user' };
const SCOPE_SEGMENTS: Record<SavedScope, string> = { document: 'file', organization: 'org', user: 'user' };

/** Parses a key such as `secrets.org.NPM_TOKEN`. Undefined for anything else (ex: a file variable name). */
export function parseSavedKey(key: string): SavedReference | undefined {
  const match = KEY_REGEX.exec(key);
  if (!match) {
    return undefined;
  }

  return { kind: match[1] === 'secrets' ? 'secret' : 'variable', scope: SCOPES[match[2]], name: match[3], key };
}

export function isSavedKey(key: string): boolean {
  return KEY_REGEX.test(key);
}

export function savedKey(kind: SavedKind, scope: SavedScope, name: string): string {
  return `${kind === 'secret' ? 'secrets' : 'vars'}.${SCOPE_SEGMENTS[scope]}.${name}`;
}

/** Ex: "personal secret", "organization variable" */
export function describeSavedReference(reference: SavedReference): string {
  const scope = reference.scope === 'user' ? 'personal' : reference.scope === 'organization' ? 'organization' : 'file';
  return `${scope} ${reference.kind}`;
}
