import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { extractTar } from './tar.js';

const LONG_DIR = `node_modules/${'very-long-package-name/'.repeat(6)}lib`;
const BIG_FILE = 'x'.repeat(70_000);

// Builds archives in the test instead of using the system tar: the formats and flags of GNU tar (Linux) and bsdtar
// (macOS) differ, and this way every kind of entry (and the invalid ones) is written exactly.
type Format = 'gnu' | 'pax' | 'ustar';

interface TarEntry {
  data?: string;
  linkname?: string;
  mode?: number;
  name: string;
  type: '0' | '1' | '2' | '5';
}

function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, '0') + '\0';
}

function header(name: string, options: { format: Format; linkname?: string; mode: number; prefix?: string; size: number; type: string }): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, 'utf8');
  block.write(octal(options.mode, 8), 100, 'latin1');
  block.write(octal(0, 8), 108, 'latin1');
  block.write(octal(0, 8), 116, 'latin1');
  block.write(octal(options.size, 12), 124, 'latin1');
  block.write(octal(0, 12), 136, 'latin1');
  block.write(' '.repeat(8), 148, 'latin1');
  block.write(options.type, 156, 'latin1');
  block.write(options.linkname ?? '', 157, 100, 'utf8');
  if (options.format === 'gnu') {
    block.write('ustar  \0', 257, 'latin1');
  } else {
    block.write('ustar\u000000', 257, 'latin1');
    block.write(options.prefix ?? '', 345, 155, 'utf8');
  }

  const checksum = block.reduce((sum, byte) => sum + byte, 0);
  block.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'latin1');
  return block;
}

function withData(block: Buffer, data: Buffer): Buffer[] {
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return [block, data, padding];
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (String(length).length + Buffer.byteLength(body) !== length) {
    length = String(length).length + Buffer.byteLength(body);
  }

  return `${length}${body}`;
}

function buildTar(entries: TarEntry[], format: Format): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? '');
    const mode = entry.mode ?? (entry.type === '5' ? 0o755 : 0o644);
    let { name } = entry;
    let prefix: string | undefined;

    if (Buffer.byteLength(name) > 100) {
      if (format === 'gnu') {
        const longName = Buffer.from(`${name}\0`);
        blocks.push(...withData(header('././@LongLink', { format, mode: 0, size: longName.length, type: 'L' }), longName));
        name = name.slice(0, 100);
      } else if (format === 'pax') {
        const records = Buffer.from(paxRecord('path', name));
        blocks.push(...withData(header(`PaxHeader/${path.basename(name)}`, { format, mode: 0o644, size: records.length, type: 'x' }), records));
        name = name.slice(0, 100);
      } else {
        const split = name.lastIndexOf('/', 155);
        prefix = name.slice(0, split);
        name = name.slice(split + 1);
      }
    }

    const size = entry.type === '0' ? data.length : 0;
    blocks.push(...withData(header(name, { format, linkname: entry.linkname, mode, prefix, size, type: entry.type }), entry.type === '0' ? data : Buffer.alloc(0)));
  }

  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

const RELEASE: TarEntry[] = [
  { name: 'codify/', type: '5' },
  { name: 'codify/bin/', type: '5' },
  { data: '#!/bin/sh\necho hi\n', mode: 0o755, name: 'codify/bin/codify', type: '0' },
  { linkname: '../package.json', name: 'codify/bin/link', type: '2' },
  { data: '{"version":"1.0.0"}', name: 'codify/package.json', type: '0' },
  { data: '', name: 'codify/empty.txt', type: '0' },
  { name: `codify/${LONG_DIR}/`, type: '5' },
  { data: BIG_FILE, name: `codify/${LONG_DIR}/index.js`, type: '0' },
];

const chunks = (buffer: Buffer, size = 1000) => (async function* () {
  for (let i = 0; i < buffer.length; i += size) {
    yield buffer.subarray(i, i + size);
  }
})();

describe('extractTar', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'codify-tar-'));
  });

  afterAll(() => rmSync(tmp, { force: true, recursive: true }));

  function expectRelease(output: string) {
    expect(readFileSync(path.join(output, 'codify', 'package.json'), 'utf8')).toBe('{"version":"1.0.0"}');
    expect(readFileSync(path.join(output, 'codify', LONG_DIR, 'index.js'), 'utf8')).toBe(BIG_FILE);
    expect(readFileSync(path.join(output, 'codify', 'empty.txt'), 'utf8')).toBe('');
    expect(statSync(path.join(output, 'codify', 'bin', 'codify')).mode & 0o111).not.toBe(0);
    expect(existsSync(path.join(output, 'codify', 'bin', 'link'))).toBe(false);
  }

  for (const format of ['gnu', 'pax', 'ustar'] as const) {
    it(`extracts files and directories of ${format} archives (long paths included) and skips symlinks`, async () => {
      const output = path.join(tmp, `out-${format}`);
      await extractTar(chunks(buildTar(RELEASE, format)), output);
      expectRelease(output);
    });
  }

  it('extracts archives made by the system tar', async () => {
    const source = path.join(tmp, 'source');
    mkdirSync(path.join(source, 'codify', 'bin'), { recursive: true });
    mkdirSync(path.join(source, 'codify', LONG_DIR), { recursive: true });
    writeFileSync(path.join(source, 'codify', 'bin', 'codify'), '#!/bin/sh\necho hi\n', { mode: 0o755 });
    writeFileSync(path.join(source, 'codify', 'package.json'), '{"version":"1.0.0"}');
    writeFileSync(path.join(source, 'codify', LONG_DIR, 'index.js'), BIG_FILE);
    writeFileSync(path.join(source, 'codify', 'empty.txt'), '');
    symlinkSync('../package.json', path.join(source, 'codify', 'bin', 'link'));

    // GNU tar on Linux, bsdtar on macOS, each with its default format
    const archive = path.join(tmp, 'system.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', source, 'codify'], { stdio: 'pipe' });

    const output = path.join(tmp, 'out-system');
    await extractTar(createReadStream(archive).pipe(createGunzip()), output);
    expectRelease(output);
  });

  it('rejects entries outside the destination', async () => {
    const output = path.join(tmp, 'out-evil', 'dest');
    for (const name of ['../evil.txt', 'codify/../../evil.txt', '/tmp/evil.txt']) {
      const archive = buildTar([{ data: 'evil', name, type: '0' }], 'ustar');
      await expect(extractTar(chunks(archive), output)).rejects.toThrow('Invalid path in archive');
    }

    expect(existsSync(path.join(tmp, 'out-evil', 'evil.txt'))).toBe(false);
  });

  it('rejects hard links', async () => {
    const archive = buildTar([{ linkname: 'codify/package.json', name: 'codify/hard', type: '1' }], 'ustar');
    await expect(extractTar(chunks(archive), path.join(tmp, 'out-hard'))).rejects.toThrow('Unsupported entry type');
  });

  it('fails on a corrupted header', async () => {
    const archive = buildTar(RELEASE, 'ustar');
    archive[0] ^= 0xFF;
    await expect(extractTar(chunks(archive), path.join(tmp, 'out-corrupted'))).rejects.toThrow('Invalid tar header checksum');
  });

  it('fails on a truncated archive', async () => {
    const full = buildTar(RELEASE, 'gnu');

    // In a header, then in the data of the large file
    await expect(extractTar(chunks(full.subarray(0, 1024 + 100)), path.join(tmp, 'out-truncated'))).rejects.toThrow('Unexpected end of archive');
    await expect(extractTar(chunks(full.subarray(0, full.indexOf('xxxxxxxx') + 1000)), path.join(tmp, 'out-truncated-2'))).rejects.toThrow('Unexpected end of archive');
  });
});
