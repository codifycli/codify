
export enum ResolverType {
  EXPLICIT_PATH,
  FILE_OR_DIRECTORY,
  REMOTE_DOCUMENT_ID,
  REMOTE_FILE,
  TEMPLATE,
}

interface Resolver {
  type: ResolverType;
  resolve(location: string): Promise<string[]>
}

class ExplicitPathResolver implements Resolver {
  type = ResolverType.EXPLICIT_PATH;

  async resolve(location: string): Promise<string[]> {
    return [location];
  }
}

class FileOrDirectoryResolver implements Resolver {
  type = ResolverType.FILE_OR_DIRECTORY;

  async resolve(location: string): Promise<string[]> {
    const exists = await FileUtils.exists(location);
    if (!exists) {
      throw new Error(`File or directory ${location} does not exist`);
    }

    const isDirectory = await FileUtils.isDir(location);
    if (isDirectory) {
      return [location];
    }

    return [location];
  }
}

class RemoteDocumentIdResolver implements Resolver {
  type = ResolverType.REMOTE_DOCUMENT_ID;

  async resolve(documentId: string): Promise<string[]> {
    return [await CodifyResolver.resolveRemoteDocumentId(documentId)];
  }
}

class RemoteFileResolver implements Resolver {
  type = ResolverType.REMOTE_FILE;

  async resolve(file: string): Promise<string[]> {
    return [await CodifyResolver.resolveRemoteFile(file)];
  }
}

class TemplateResolver implements Resolver {
  type = ResolverType.TEMPLATE;

  async resolve(templateName: string): Promise<string[]> {
    return [await CodifyResolver.resolveTemplate(templateName)];
  }
}


export class CodifyResolver {
  private static readonly implementations: Record<ResolverType, Resolver> = {
    [ResolverType.FILE_OR_DIRECTORY]: new FileOrDirectoryResolver(),
    [ResolverType.REMOTE_DOCUMENT_ID]: new RemoteDocumentIdResolver(),
    [ResolverType.REMOTE_FILE]: new RemoteFileResolver(),
    [ResolverType.TEMPLATE]: new TemplateResolver(),
  }

  static async runUntilResolves(location: string, resolvers: (ResolverType | null)[]): Promise<string[]> {
    for (const resolver of resolvers) {
      if (!resolver) continue;

      const files = await this.implementations[resolver].resolve(location);
      if (files.length > 0) {
        return files;
      }
    }

    throw new Error(`Unable to resolve ${location} with resolvers ${resolvers}`);
  }
}
