import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ShellValidationError } from '../common/errors.js';
import { ShellUtils } from './shell.js';

describe('ShellUtils.validateShell', () => {
  it('passes on a clean shell', async () => {
    await expect(ShellUtils.validateShell()).resolves.toBeUndefined();
  });

  describe('dirty output', () => {
    let originalShell: string | undefined;
    let tmpScript: string;

    beforeEach(async () => {
      originalShell = process.env.SHELL;

      // Write a wrapper script that prints unexpected output before delegating
      const realShell = originalShell ?? '/bin/sh';
      tmpScript = path.join(os.tmpdir(), `codify-test-shell-${Date.now()}.sh`);
      await fs.writeFile(
        tmpScript,
        `#!/bin/sh\necho "unexpected banner output"\nexec ${realShell} "$@"\n`,
        { mode: 0o755 },
      );

      process.env.SHELL = tmpScript;
    });

    afterEach(async () => {
      process.env.SHELL = originalShell;
      await fs.unlink(tmpScript).catch(() => {});
    });

    it('throws ShellValidationError with timedOut=false when shell emits unexpected output', async () => {
      await expect(ShellUtils.validateShell()).rejects.toMatchObject({
        name: 'ShellValidationError',
        timedOut: false,
      });
    });

    it('includes the unexpected output in the error', async () => {
      try {
        await ShellUtils.validateShell();
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ShellValidationError);
        const shellErr = err as ShellValidationError;
        expect(shellErr.capturedOutput).toContain('unexpected banner output');
      }
    });
  });
});
