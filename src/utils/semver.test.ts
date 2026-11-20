import { describe, expect, it } from 'vitest';

import { coerceVersion, compareVersions, latestVersion, parseVersion } from './semver.js';

describe('semver', () => {
  it('parses and cleans versions', () => {
    expect(parseVersion('v1.2.3')?.version).toBe('1.2.3');
    expect(parseVersion(' =1.2.3-beta.1+build ')?.version).toBe('1.2.3-beta.1');
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
  });

  it('orders versions like the semver spec', () => {
    const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '1.10.0', '2.0.0'];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareVersions(ordered[i], ordered[i + 1])).toBeLessThan(0);
      expect(compareVersions(ordered[i + 1], ordered[i])).toBeGreaterThan(0);
    }

    expect(compareVersions('1.0.0+a', '1.0.0+b')).toBe(0);
    expect(() => compareVersions('1.0', '1.0.0')).toThrow();
  });

  it('coerces versions', () => {
    expect(coerceVersion('1.2.0-beta.5')).toBe('1.2.0');
    expect(coerceVersion('v2')).toBe('2.0.0');
    expect(coerceVersion('release-1.4')).toBe('1.4.0');
    expect(coerceVersion('none')).toBeNull();
  });

  it('picks the latest release', () => {
    expect(latestVersion(['1.9.9', '1.10.0', 'v1.2.3', '2.0.0-beta.1', 'foo'])).toBe('1.10.0');
    expect(latestVersion(['1.0.0-beta'])).toBeUndefined();
    expect(latestVersion([])).toBeUndefined();
  });
});
