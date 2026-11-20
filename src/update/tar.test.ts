import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { extractTar } from './tar.js';

const LONG_DIR = `node_modules/${'very-long-package-name/'.repeat(6)}lib`;

describe('extractTar', () => {
  let tmp: string;
  let source: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'codify-tar-'));
    source = path.join(tmp, 'source');
    mkdirSync(path.join(source, 'codify', 'bin'), { recursive: true });
    mkdirSync(path.join(source, 'codify', LONG_DIR), { recursive: true });
    writeFileSync(path.join(source, 'codify', 'bin', 'codify'), '#!/bin/sh\necho hi\n', { mode: 0o755 });
    writeFileSync(path.join(source, 'codify', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(path.join(source, 'codify', LONG_DIR, 'index.js'), 'x'.repeat(70_000));
    writeFileSync(path.join(source, 'codify', 'empty.txt'), '');
    symlinkSync('../package.json', path.join(source, 'codify', 'bin', 'link'));
  });

  afterAll(() => rmSync(tmp, { force: true, recursive: true }));

  for (const format of ['gnu', 'posix', 'ustar']) {
    it(`extracts files and directories of ${format} archives and skips symlinks`, async () => {
      const archive = path.join(tmp, `${format}.tar.gz`);
      try {
        execFileSync('tar', [`--format=${format}`, '-czf', archive, '-C', source, 'codify'], { stdio: 'pipe' });
      } catch (error) {
        // ustar can't store the long path
        if (format === 'ustar') return;
        throw error;
      }

      const output = path.join(tmp, `out-${format}`);
      await extractTar(createReadStream(archive).pipe(createGunzip()), output);

      expect(readFileSync(path.join(output, 'codify', 'package.json'), 'utf8')).toBe('{"version":"1.0.0"}');
      expect(readFileSync(path.join(output, 'codify', LONG_DIR, 'index.js'), 'utf8')).toBe('x'.repeat(70_000));
      expect(readFileSync(path.join(output, 'codify', 'empty.txt'), 'utf8')).toBe('');
      expect(statSync(path.join(output, 'codify', 'bin', 'codify')).mode & 0o111).not.toBe(0);
      expect(existsSync(path.join(output, 'codify', 'bin', 'link'))).toBe(false);
    });
  }

  it('rejects entries outside the destination', async () => {
    const archive = path.join(tmp, 'evil.tar');
    writeFileSync(path.join(tmp, 'evil.txt'), 'evil');
    execFileSync('tar', ['-cf', archive, '-C', path.join(tmp, 'source'), '--absolute-names', '--transform', 's,^,../../,', '../evil.txt'], { stdio: 'pipe' });

    await expect(extractTar(createReadStream(archive), path.join(tmp, 'out-evil'))).rejects.toThrow('Invalid path in archive');
    expect(lstatSync(tmp).isDirectory()).toBe(true);
  });

  it('fails on a truncated archive', async () => {
    const archive = path.join(tmp, 'gnu.tar.gz');
    const full = execFileSync('gzip', ['-dc', archive]);
    const chunks = (buffer: Buffer) => (async function* () {
      yield buffer;
    })();

    // In a header, then in the data of the large file
    await expect(extractTar(chunks(full.subarray(0, 2048 + 100)), path.join(tmp, 'out-truncated'))).rejects.toThrow('Unexpected end of archive');
    await expect(extractTar(chunks(full.subarray(0, full.indexOf('xxxxxxxx') + 1000)), path.join(tmp, 'out-truncated-2'))).rejects.toThrow('Unexpected end of archive');
  });
});
