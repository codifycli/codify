import { createWriteStream } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';

// A small streaming tar extractor for the CLI update tarballs (replaces tar-fs). Like the oclif updater, only files
// and directories are extracted, symlinks are skipped and other entry types are an error. Supports ustar, pax
// (long paths and sizes) and GNU long names. Entries that would land outside the destination are an error.

const BLOCK_SIZE = 512;

interface Entry {
  mode: number;
  name: string;
  size: number;
  type: string;
}

export async function extractTar(source: AsyncIterable<Buffer>, destination: string): Promise<void> {
  const reader = new BlockReader(source);
  const root = path.resolve(destination);
  const umask = process.umask();
  await mkdir(root, { recursive: true });

  // Overrides for the next entry, from pax ('x') or GNU long name ('L', 'K') entries
  let override: { name?: string; size?: number } = {};

  while (true) {
    const header = await reader.read(BLOCK_SIZE);
    if (!header && reader.hasLeftover()) {
      throw new Error('Unexpected end of archive');
    }

    if (!header || isZeroBlock(header)) {
      return;
    }

    const entry = parseHeader(header);
    if (override.name !== undefined) entry.name = override.name;
    if (override.size !== undefined) entry.size = override.size;

    switch (entry.type) {
      case 'x': { // pax extended header for the next entry
        override = parsePax((await reader.readEntryData(entry.size)).toString('utf8'));
        continue;
      }

      case 'g': { // pax global header
        await reader.readEntryData(entry.size);
        continue;
      }

      case 'L': { // GNU long name for the next entry
        override = { ...override, name: (await reader.readEntryData(entry.size)).toString('utf8').replace(/\0.*$/s, '') };
        continue;
      }

      case 'K': { // GNU long link name: links are skipped
        await reader.readEntryData(entry.size);
        continue;
      }
    }

    override = {};
    const target = path.resolve(root, entry.name);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Invalid path in archive: ${entry.name}`);
    }

    switch (entry.type) {
      case '0':
      case '\0':
      case '7': { // file
        await mkdir(path.dirname(target), { recursive: true });
        const file = createWriteStream(target, { mode: 0o600 });
        // Also listens for the stream errors (ex: the file can't be opened) so they are never unhandled
        const written = finished(file);
        written.catch(() => {});
        try {
          await reader.pipeEntryData(entry.size, file);
          file.end();
          await written;
        } catch (error) {
          file.destroy();
          throw error;
        }

        await chmod(target, entry.mode & ~umask & 0o7777);
        break;
      }

      case '5': { // directory
        await mkdir(target, { recursive: true });
        await chmod(target, (entry.mode & ~umask & 0o7777) | 0o700);
        await reader.readEntryData(entry.size);
        break;
      }

      case '2': { // symlink: skipped, like the oclif updater
        await reader.readEntryData(entry.size);
        break;
      }

      default: {
        throw new Error(`Unsupported entry type '${entry.type}' in archive: ${entry.name}`);
      }
    }
  }
}

function parseHeader(block: Buffer): Entry {
  const checksum = parseOctal(block.subarray(148, 156));
  let sum = 8 * 0x20; // the checksum field counts as spaces
  for (let i = 0; i < BLOCK_SIZE; i++) {
    if (i < 148 || i >= 156) sum += block[i];
  }

  if (checksum !== sum) {
    throw new Error('Invalid tar header checksum');
  }

  const name = readString(block, 0, 100);
  // POSIX ustar ('ustar\0') has a path prefix field. The old GNU format ('ustar  ') uses those bytes for other things.
  const isUstar = block.subarray(257, 263).toString('latin1') === 'ustar\0';
  const prefix = isUstar ? readString(block, 345, 155) : '';

  return {
    mode: parseOctal(block.subarray(100, 108)),
    name: prefix ? `${prefix}/${name}` : name,
    size: parseSize(block.subarray(124, 136)),
    type: String.fromCodePoint(block[156]),
  };
}

function parsePax(text: string): { name?: string; size?: number } {
  const result: { name?: string; size?: number } = {};
  let rest = text;
  while (rest.length > 0) {
    const space = rest.indexOf(' ');
    const length = Number.parseInt(rest.slice(0, space), 10);
    if (space <= 0 || !Number.isFinite(length) || length <= 0) {
      break;
    }

    // The length counts bytes, not characters
    const record = Buffer.from(rest, 'utf8').subarray(0, length).toString('utf8');
    const [key, ...value] = record.slice(space + 1, -1).split('=');
    if (key === 'path') result.name = value.join('=');
    if (key === 'size') result.size = Number.parseInt(value.join('='), 10);
    rest = rest.slice(record.length);
  }

  return result;
}

function parseSize(field: Buffer): number {
  // Base-256 encoding for sizes over 8 GB
  if (field[0] & 0x80) {
    let value = 0;
    for (let i = 1; i < field.length; i++) value = (value * 256) + field[i];
    return value;
  }

  return parseOctal(field);
}

function parseOctal(field: Buffer): number {
  const text = field.toString('latin1').replaceAll(/[\0 ]/g, '');
  return text ? Number.parseInt(text, 8) : 0;
}

function readString(block: Buffer, offset: number, length: number): string {
  const field = block.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

function isZeroBlock(block: Buffer): boolean {
  return block.every((byte) => byte === 0);
}

/** Reads exact amounts of bytes from a stream of chunks. */
class BlockReader {
  private buffered: Buffer[] = [];
  private bufferedLength = 0;
  private done = false;
  private iterator: AsyncIterator<Buffer>;

  constructor(source: AsyncIterable<Buffer>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  /** True if the stream ended in the middle of a block. */
  hasLeftover(): boolean {
    return this.bufferedLength > 0;
  }

  /** Exactly `size` bytes, or null if the stream ended first. */
  async read(size: number): Promise<Buffer | null> {
    while (this.bufferedLength < size) {
      if (!(await this.fill())) {
        return null;
      }
    }

    const all = Buffer.concat(this.buffered);
    this.buffered = all.length > size ? [all.subarray(size)] : [];
    this.bufferedLength = all.length - size;
    return all.subarray(0, size);
  }

  /** The data of an entry (and its padding) in memory. Only for small entries (headers). */
  async readEntryData(size: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    await this.pipeEntryData(size, { write: (chunk: Buffer) => chunks.push(chunk) });
    return Buffer.concat(chunks);
  }

  /** Streams the data of an entry to the writer, then skips the padding to the next block. */
  async pipeEntryData(size: number, writer: { write(chunk: Buffer): unknown; once?(event: 'drain', cb: () => void): unknown }): Promise<void> {
    let remaining = size;
    while (remaining > 0) {
      if (this.bufferedLength === 0 && !(await this.fill())) {
        throw new Error('Unexpected end of archive');
      }

      const chunk = this.buffered.shift()!;
      const part = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      if (chunk.length > remaining) {
        this.buffered.unshift(chunk.subarray(remaining));
      }

      this.bufferedLength -= part.length;
      remaining -= part.length;
      if (writer.write(part) === false && writer.once) {
        await new Promise<void>((resolve) => {
          writer.once!('drain', resolve);
        });
      }
    }

    const padding = (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding > 0 && !(await this.read(padding))) {
      throw new Error('Unexpected end of archive');
    }
  }

  private async fill(): Promise<boolean> {
    if (this.done) {
      return false;
    }

    const { done, value } = await this.iterator.next();
    if (done) {
      this.done = true;
      return false;
    }

    this.buffered.push(value);
    this.bufferedLength += value.length;
    return true;
  }
}
