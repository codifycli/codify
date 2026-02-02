import { DashboardApiClient } from '../../../api/dashboard/index.js';
import { FileType, InMemoryFile } from '../entities.js';

export class RemoteTemplateReader {
  async read(filePath: string): Promise<InMemoryFile> {
    const document = await DashboardApiClient.getDocument(filePath);

    return {
      contents: JSON.stringify(document.contents),
      path: filePath,
      fileType: FileType.REMOTE,
    }
  }
}
