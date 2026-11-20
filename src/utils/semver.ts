// The small part of semver the CLI needs: parse, compare, coerce and pick the latest release.

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
  version: string;
}

const SEMVER_REGEX = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i;

/** Parses a version like `1.2.3`, `v1.2.3-beta.1` or `=1.2.3+build`. Returns null if it isn't valid semver. */
export function parseVersion(value: string): SemVer | null {
  const match = value.trim().replace(/^[=v]+/, '').match(SEMVER_REGEX);
  if (!match) {
    return null;
  }

  const [, major, minor, patch, prerelease] = match;
  const prereleaseIds = prerelease
    ? prerelease.split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id))
    : [];

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prereleaseIds,
    version: `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ''}`,
  };
}

/** The first `x.y.z` (missing parts are 0) found in the string, ex: `release-1.2` -> `1.2.0`. Drops pre-release tags. */
export function coerceVersion(value: string): null | string {
  const match = value.match(/(\d{1,16})(?:\.(\d{1,16}))?(?:\.(\d{1,16}))?/);
  if (!match) {
    return null;
  }

  return `${Number(match[1])}.${Number(match[2] ?? 0)}.${Number(match[3] ?? 0)}`;
}

/** Negative if a < b, positive if a > b, 0 if equal (build metadata is ignored). Throws on invalid versions. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) {
    throw new TypeError(`Invalid version: ${va ? b : a}`);
  }

  return (va.major - vb.major)
    || (va.minor - vb.minor)
    || (va.patch - vb.patch)
    || comparePrerelease(va.prerelease, vb.prerelease);
}

/** The highest release (pre-releases are ignored) in the list, cleaned (ex: `v1.2.3` -> `1.2.3`). */
export function latestVersion(versions: string[]): string | undefined {
  return versions
    .map((v) => parseVersion(v)?.version ?? coerceVersion(v))
    .filter((v): v is string => v !== null && parseVersion(v)!.prerelease.length === 0)
    .sort((a, b) => compareVersions(b, a))[0];
}

function comparePrerelease(a: Array<number | string>, b: Array<number | string>): number {
  // A version without a pre-release is higher than one with a pre-release
  if (a.length === 0 || b.length === 0) {
    return b.length - a.length;
  }

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] === b[i]) continue;

    // Numeric identifiers are lower than alphanumeric ones
    if (typeof a[i] === 'number' && typeof b[i] === 'number') return (a[i] as number) - (b[i] as number);
    if (typeof a[i] === 'number') return -1;
    if (typeof b[i] === 'number') return 1;
    return (a[i] as string) < (b[i] as string) ? -1 : 1;
  }

  return 0;
}
