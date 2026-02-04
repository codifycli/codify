import { LoginHelper } from '../../connect/login-helper.js';
import { Reporter } from '../../ui/reporters/reporter.js';
import { InMemoryFile } from './entities.js';
import { MultipleFilesError, NoCodifyFileError } from './errors.js';
import { CodifyResolverRunner, ResolverResult } from './runners.js';

export enum ResolverType {
  LOCAL = 'LOCAL',
  REMOTE_DOCUMENT_ID = 'REMOTE_DOCUMENT_ID',
  REMOTE_DOCUMENT = 'REMOTE_DOCUMENT',
  TEMPLATE = 'TEMPLATE',
  REMOTE_DEFAULT_DOCUMENT = 'REMOTE_DEFAULT_DOCUMENT',
}

interface ResolverArgs {
  resolverType?: ResolverType;
  path?: string;
  allowTemplates?: boolean;
  reporter?: Reporter;
  allowEmpty?: boolean;
}

/**
 * Resolver for resolving and getting the contents of files based on a location. It operated in a fall through manner,
 * where it tries different resolvers until it finds a match (starting with the LOCAL resolver).
 */
export class CodifyResolver {
  
  /**
   * Order:
   * 1. If a path is provided, parse it and look for the location within the path
   * 3. If it is a path (relative or absolute) then search for that directory or file
   * 4. If the path is an uuid (try to match it with a UUID) on the user's account (if they are logged in)
   * 5. Attempt to search for the name on the user's account (if they are logged in)
   * 6. Attempt to resolve to a public template (if allowTemplate is enabled)
   * Error out and tell the user that the following file could not be found
   *
   *
   * @param location
   * @param args
   */
  static async resolveFile(location: string, args?: ResolverArgs): Promise<InMemoryFile | null> {
    const resolvedFiles = await CodifyResolver.run(location, args)
    return this.narrow(resolvedFiles, args);
  }
  
  private static async run(location: string, args?: ResolverArgs): Promise<ResolverResult> {
    if (args?.resolverType) {
      return CodifyResolverRunner.runResolver(location, args.resolverType);
    }

    if (args?.path) {
      return CodifyResolverRunner.resolveLocal(args?.path)
    }

    const isLoggedIn = LoginHelper.get()?.isLoggedIn;

    return CodifyResolverRunner.run(location, [
      ResolverType.LOCAL,
      (isLoggedIn) ? ResolverType.REMOTE_DOCUMENT_ID : null,
      (isLoggedIn) ? ResolverType.REMOTE_DOCUMENT : null,
      (args?.allowTemplates) ? ResolverType.TEMPLATE : null,
      (isLoggedIn) ? ResolverType.REMOTE_DEFAULT_DOCUMENT : null,
    ]);
  }

  private static async narrow(result: ResolverResult, args?: ResolverArgs): Promise<InMemoryFile | null> {
    if (result.files.length === 0) {
      if (!args?.allowEmpty) {
        throw new NoCodifyFileError(result);
      }

      return null;
    }

    if (result.files.length > 1) {
      if (!args?.reporter) {
        throw new MultipleFilesError(result);
      }
      
      const reporter = args?.reporter;
      const index = await reporter.promptOptions(
        'Multiple matching Codify files found',
        result.files.map((file) => result.location + file.path),
      );

      return result.files[index];
    }

    return result.files[0];
  }
}
