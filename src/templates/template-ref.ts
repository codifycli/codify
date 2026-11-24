/** A template reference with an optional pinned version: `nvm`, `@codify/nvm`, `@codify/nvm@1.2.0`. */
export type TemplateRef = {
  source: string;
  version?: string;
}

// eslint-disable-next-line require-unicode-regexp -- ASCII only; the v flag would make the trailing "-" an error
const VERSIONED = /^(.+)@(\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?)$/;

/** Splits a trailing `@X.Y.Z` from a template name. `@codify/nvm` (no version) is returned as is. */
export function parseTemplateRef(value: string): TemplateRef {
  const match = VERSIONED.exec(value);
  return match ? { source: match[1], version: match[2] } : { source: value };
}

export function formatTemplateRef(ref: TemplateRef): string {
  return ref.version ? `${ref.source}@${ref.version}` : ref.source;
}
