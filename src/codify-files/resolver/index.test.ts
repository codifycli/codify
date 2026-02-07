import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResolverType } from './runners';
import * as fs from 'node:fs';
import { CodifyResolver } from './index';
import { LoginHelper } from '../../connect/login-helper.js';
import { Reporter } from '../../ui/reporters/reporter.js';
import { NoCodifyFileError, MultipleFilesError } from './errors.js';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

vi.mock('../../connect/login-helper.js');
vi.mock('../../api/dashboard/index.js');
vi.mock('../../ui/reporters/reporter.js');


describe('Codify resolver tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveFile', () => {
    it('Can resolve a local file', async () => {
      fs.writeFileSync('/codify.jsonc', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.jsonc', { resolverType: ResolverType.LOCAL});
      expect(result?.path).to.eq('/codify.jsonc');
    })

    it('Should return null when no file is found and allowEmpty is true', async () => {
      const result = await CodifyResolver.resolveFile('/nonexistent.codify.jsonc', {
        resolverType: ResolverType.LOCAL,
        allowEmpty: true
      });
      expect(result).to.be.null;
    })

    it('Should throw NoCodifyFileError when no file is found and allowEmpty is false', async () => {
      await expect(
        CodifyResolver.resolveFile('/nonexistent.codify.jsonc', {
          resolverType: ResolverType.LOCAL,
          allowEmpty: false
        })
      ).rejects.toThrow(NoCodifyFileError);
    })

    it('Should throw NoCodifyFileError by default when no file is found', async () => {
      await expect(
        CodifyResolver.resolveFile('/nonexistent.codify.jsonc', {
          resolverType: ResolverType.LOCAL
        })
      ).rejects.toThrow(NoCodifyFileError);
    })

    it('Should throw MultipleFilesError when multiple files are found without a reporter', async () => {
      fs.mkdirSync('/test-dir', { recursive: true });
      fs.writeFileSync('/test-dir/file1.codify.jsonc', '{}', { encoding: 'utf-8' });
      fs.writeFileSync('/test-dir/file2.codify.jsonc', '{}', { encoding: 'utf-8' });

      await expect(
        CodifyResolver.resolveFile('/test-dir', {
          path: '/test-dir'
        })
      ).rejects.toThrow(MultipleFilesError);
    })

    it('Should prompt user when multiple files are found with a reporter', async () => {
      fs.mkdirSync('/test-dir', { recursive: true });
      fs.writeFileSync('/test-dir/file1.codify.jsonc', '{"name":"file1"}', { encoding: 'utf-8' });
      fs.writeFileSync('/test-dir/file2.codify.jsonc', '{"name":"file2"}', { encoding: 'utf-8' });

      const mockReporter = {
        promptOptions: vi.fn().mockResolvedValue(0)
      } as unknown as Reporter;

      const result = await CodifyResolver.resolveFile('test', {
        path: '/test-dir',
        reporter: mockReporter
      });

      expect(mockReporter.promptOptions).toHaveBeenCalled();
      expect(result?.path).to.eq('/test-dir/file1.codify.jsonc');
    })

    it('Should return the selected file when user chooses from multiple options', async () => {
      fs.mkdirSync('/test-dir', { recursive: true });
      fs.writeFileSync('/test-dir/file1.codify.jsonc', '{"name":"file1"}', { encoding: 'utf-8' });
      fs.writeFileSync('/test-dir/file2.codify.jsonc', '{"name":"file2"}', { encoding: 'utf-8' });

      const mockReporter = {
        promptOptions: vi.fn().mockResolvedValue(1)
      } as unknown as Reporter;

      const result = await CodifyResolver.resolveFile('test', {
        path: '/test-dir',
        reporter: mockReporter
      });

      expect(result?.path).to.eq('/test-dir/file2.codify.jsonc');
    })
  })

  describe('resolveAll', () => {
    it('Should resolve all files in a directory', async () => {
      fs.mkdirSync('/test-dir', { recursive: true });
      fs.writeFileSync('/test-dir/file1.codify.jsonc', '{}', { encoding: 'utf-8' });
      fs.writeFileSync('/test-dir/file2.codify.jsonc', '{}', { encoding: 'utf-8' });

      const results = await CodifyResolver.resolveAll('test', {
        path: '/test-dir'
      });

      expect(results).toHaveLength(2);
      expect(results[0].path).to.eq('/test-dir/file1.codify.jsonc');
      expect(results[1].path).to.eq('/test-dir/file2.codify.jsonc');
    })

    it('Should return empty array when no files are found', async () => {
      const results = await CodifyResolver.resolveAll('test', {
        path: '/nonexistent-dir',
        allowEmpty: true
      });

      expect(results).toHaveLength(0);
    })

    it('Should resolve a single file', async () => {
      fs.writeFileSync('/single.codify.jsonc', '{}', { encoding: 'utf-8' });

      const results = await CodifyResolver.resolveAll('/single.codify.jsonc', {
        resolverType: ResolverType.LOCAL
      });

      expect(results).toHaveLength(1);
      expect(results[0].path).to.eq('/single.codify.jsonc');
    })
  })

  describe('resolver type selection', () => {
    it('Should use specified resolver type when provided', async () => {
      fs.writeFileSync('/codify.jsonc', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.jsonc', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.path).to.eq('/codify.jsonc');
    })

    it('Should use path resolver when path is provided', async () => {
      fs.writeFileSync('/codify.jsonc', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('any-location', {
        path: '/codify.jsonc'
      });

      expect(result?.path).to.eq('/codify.jsonc');
    })

    it('Should prioritize resolverType over path', async () => {
      fs.writeFileSync('/codify.jsonc', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.jsonc', {
        resolverType: ResolverType.LOCAL,
        path: '/some-other-path'
      });

      expect(result?.path).to.eq('/codify.jsonc');
    })
  })

  describe('file type detection', () => {
    it('Should detect JSONC file type', async () => {
      fs.writeFileSync('/codify.jsonc', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.jsonc', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.fileType).to.eq('jsonc');
    })

    it('Should detect JSON file type', async () => {
      fs.writeFileSync('/codify.json', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.json', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.fileType).to.eq('json');
    })

    it('Should detect JSON5 file type', async () => {
      fs.writeFileSync('/codify.json5', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.json5', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.fileType).to.eq('json5');
    })

    it('Should detect YAML file type', async () => {
      fs.writeFileSync('/codify.yaml', '{}', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.yaml', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.fileType).to.eq('yaml');
    })
  })

  describe('file content handling', () => {
    it('Should preserve file contents', async () => {
      const testContent = '{ "test": "value" }';
      fs.writeFileSync('/codify.jsonc', testContent, { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.jsonc', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.contents).to.eq(testContent);
    })

    it('Should handle empty files', async () => {
      fs.writeFileSync('/codify.jsonc', '', { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.jsonc', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.contents).to.eq('');
    })

    it('Should handle files with special characters', async () => {
      const testContent = '{ "test": "value with special chars: @#$%^&*()" }';
      fs.writeFileSync('/codify.jsonc', testContent, { encoding: 'utf-8' });

      const result = await CodifyResolver.resolveFile('/codify.jsonc', {
        resolverType: ResolverType.LOCAL
      });

      expect(result?.contents).to.eq(testContent);
    })
  })

  describe('directory handling', () => {
    it('Should resolve all codify files in a directory', async () => {
      fs.mkdirSync('/test-dir', { recursive: true });
      fs.writeFileSync('/test-dir/config.codify.jsonc', '{}', { encoding: 'utf-8' });
      fs.writeFileSync('/test-dir/other.codify.json', '{}', { encoding: 'utf-8' });
      fs.writeFileSync('/test-dir/ignore-me.txt', '{}', { encoding: 'utf-8' });

      const results = await CodifyResolver.resolveAll('test', {
        path: '/test-dir'
      });

      expect(results).toHaveLength(2);
      expect(results.map(f => f.path)).toContain('/test-dir/config.codify.jsonc');
      expect(results.map(f => f.path)).toContain('/test-dir/other.codify.json');
    })

    it('Should ignore non-codify files in directory', async () => {
      fs.mkdirSync('/test-dir', { recursive: true });
      fs.writeFileSync('/test-dir/readme.md', 'content', { encoding: 'utf-8' });
      fs.writeFileSync('/test-dir/package.json', '{}', { encoding: 'utf-8' });

      const results = await CodifyResolver.resolveAll('test', {
        path: '/test-dir',
        allowEmpty: true
      });

      expect(results).toHaveLength(0);
    })
  })

  afterEach(() => {
    vi.resetAllMocks();
  })
})
