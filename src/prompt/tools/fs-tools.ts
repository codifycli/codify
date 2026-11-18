import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { isBlockedPath, resolveAllowedPath } from './path-guard.js';

const DEFAULT_READ_LINES = 500;
const MAX_READ_BYTES = 512 * 1024;
const MAX_LINE_LENGTH = 2000;
const MAX_DIRECTORY_ENTRIES = 500;
const MAX_SEARCH_MATCHES = 200;
const MAX_SEARCH_FILES = 5000;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', '.Trash', 'Library', '.cache', '.npm', '.cargo', '.rustup']);

export interface ReadFileResult {
  path: string;
  content: string;
  startLine: number;
  totalLines: number;
  truncated: boolean;
}

export async function readFileTool(args: { path: string; offset?: number; limit?: number }): Promise<ReadFileResult> {
  const filePath = await resolveAllowedPath(args.path);
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    throw new Error(`${args.path} is a directory. Use list_directory instead.`);
  }

  const handle = await fs.open(filePath, 'r');
  let buffer: Buffer;
  try {
    buffer = Buffer.alloc(Math.min(stat.size, MAX_READ_BYTES));
    await handle.read(buffer, 0, buffer.length, 0);
  } finally {
    await handle.close();
  }

  if (buffer.includes(0)) {
    throw new Error(`${args.path} looks like a binary file.`);
  }

  const lines = buffer.toString('utf8').split('\n');
  const start = Math.max(0, args.offset ?? 0);
  const end = Math.min(lines.length, start + (args.limit ?? DEFAULT_READ_LINES));
  const content = lines.slice(start, end)
    .map((line) => (line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + '…' : line))
    .join('\n');

  return {
    path: filePath,
    content,
    startLine: start,
    totalLines: lines.length,
    truncated: end < lines.length || stat.size > MAX_READ_BYTES,
  };
}

export interface DirectoryEntry {
  name: string;
  type: 'directory' | 'file' | 'other' | 'symlink';
  size?: number;
}

export async function listDirectoryTool(args: { path: string }): Promise<{ entries: DirectoryEntry[]; path: string; truncated: boolean; }> {
  const dirPath = await resolveAllowedPath(args.path);
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });

  const entries = await Promise.all(dirents.slice(0, MAX_DIRECTORY_ENTRIES).map(async (dirent): Promise<DirectoryEntry> => {
    const type = dirent.isDirectory() ? 'directory' : dirent.isFile() ? 'file' : dirent.isSymbolicLink() ? 'symlink' : 'other';
    const size = type === 'file' ? (await fs.stat(path.join(dirPath, dirent.name)).catch(() => undefined))?.size : undefined;
    return { name: dirent.name, type, ...(size === undefined ? {} : { size }) };
  }));

  return { path: dirPath, entries, truncated: dirents.length > MAX_DIRECTORY_ENTRIES };
}

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

export async function searchFilesTool(args: { pattern: string; path: string; glob?: string }): Promise<{ matches: SearchMatch[]; truncated: boolean; }> {
  let regex: RegExp;
  try {
    regex = new RegExp(args.pattern);
  } catch (error) {
    throw new Error(`Invalid regular expression: ${(error as Error).message}`);
  }

  const globRegex = args.glob ? globToRegExp(args.glob) : undefined;
  const root = await resolveAllowedPath(args.path);
  const matches: SearchMatch[] = [];
  let filesSearched = 0;
  let truncated = false;

  const searchFile = async (file: string) => {
    if (globRegex && !globRegex.test(path.basename(file))) return;
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile() || stat.size > MAX_SEARCH_FILE_BYTES) return;

    filesSearched++;
    const buffer = await fs.readFile(file).catch(() => undefined);
    if (!buffer || buffer.includes(0)) return;

    const lines = buffer.toString('utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (regex.test(line)) {
        matches.push({ file, line: index + 1, text: line.length > 500 ? line.slice(0, 500) + '…' : line });
        if (matches.length >= MAX_SEARCH_MATCHES) {
          truncated = true;
          return;
        }
      }
    }
  };

  const walk = async (dir: string): Promise<void> => {
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const dirent of dirents) {
      if (truncated || filesSearched >= MAX_SEARCH_FILES) {
        truncated = true;
        return;
      }

      const full = path.join(dir, dirent.name);
      if (isBlockedPath(full)) continue;
      if (dirent.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(dirent.name)) await walk(full);
      } else if (dirent.isFile()) {
        await searchFile(full);
      }
    }
  };

  const rootStat = await fs.stat(root);
  await (rootStat.isDirectory() ? walk(root) : searchFile(root));
  return { matches, truncated };
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replaceAll(/[$()+.[\\\]^{|}]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');
  return new RegExp(`^${escaped}$`);
}
