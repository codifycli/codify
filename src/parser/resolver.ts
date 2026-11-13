import * as fs from 'node:fs/promises';
import path from 'node:path';
import { validate } from 'uuid';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { NoCodifyFilesError } from '../common/errors.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { type CodifySource, CodifySourceType } from './entities.js';
import { CODIFY_FILE_REGEX } from './index.js';

export type { CodifySource } from './entities.js';
export { CodifySourceType } from './entities.js';

export interface ResolveArgs {
  // What the user passed in (path, document id, or template name). Defaults to the current directory.
  location?: string;
  // Allow `location` to resolve to a public template.
  allowTemplates?: boolean;
  // Return null instead of throwing when nothing is found.
  allowEmpty?: boolean;
}

/**
 * Figures out which Codify config a command should run against.
 *
 * Resolution order:
 *   1. A UUID                  → the Codify dashboard document with that id
 *   2. An existing file        → that file
 *   3. An existing directory   → the codify file inside it (the user is prompted if there are several)
 *   4. Anything else           → the public template with that name (only if `allowTemplates` is set)
 *
 * If a directory (or the current directory when no location is given) has no codify files:
 *   5. Logged in               → the user's default dashboard document
 *   6. Otherwise               → null if `allowEmpty` is set, else NoCodifyFilesError (with usage help)
 */
export const CodifyResolver = {
  async resolve(args: ResolveArgs, reporter: Reporter): Promise<CodifySource | null> {
    const location = args.location ?? process.cwd();

    if (validate(location)) {
      return { type: CodifySourceType.REMOTE, documentId: location };
    }

    const stat = await fs.stat(path.resolve(location)).catch(() => null);

    if (stat?.isFile()) {
      return { type: CodifySourceType.LOCAL, path: path.resolve(location) };
    }

    if (stat?.isDirectory()) {
      const file = await CodifyResolver.pickFileInDir(location, reporter);
      if (file) {
        return { type: CodifySourceType.LOCAL, path: file };
      }

      return CodifyResolver.resolveFallback(location, args);
    }

    // Not on disk. Try the template registry.
    if (args.allowTemplates) {
      const template = await DashboardApiClient.getTemplate(location);
      if (template) {
        return { type: CodifySourceType.TEMPLATE, template };
      }
    }

    throw NoCodifyFilesError.notFound(location);
  },

  /** Returns the codify file in a directory, prompting the user to choose if there are several. */
  async pickFileInDir(dir: string, reporter: Reporter): Promise<null | string> {
    const codifyFiles = (await fs.readdir(dir))
      .filter((name) => CODIFY_FILE_REGEX.test(name))
      .sort();

    if (codifyFiles.length === 0) {
      return null;
    }

    if (codifyFiles.length === 1) {
      return path.resolve(dir, codifyFiles[0]);
    }

    const answer = await reporter.promptOptions(
      'Multiple codify files found in dir. Please select one:',
      codifyFiles,
    );

    return path.resolve(dir, codifyFiles[answer]);
  },

  /** No codify files on disk: fall back to the user's default dashboard document, or give up. */
  async resolveFallback(dir: string, args: ResolveArgs): Promise<CodifySource | null> {
    if (LoginHelper.get()?.isLoggedIn) {
      const documentId = await DashboardApiClient.getDefaultDocumentId();
      if (documentId) {
        return { type: CodifySourceType.REMOTE, documentId };
      }
    }

    if (args.allowEmpty) {
      return null;
    }

    throw NoCodifyFilesError.emptyDir(path.resolve(dir));
  },
};
