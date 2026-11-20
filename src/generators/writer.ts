import { isUuid } from '../utils/uuid.js';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { FileUtils } from '../utils/file.js';

export class FileUpdater {
  static async write(filePath: string, content: string) {
    // Remote file
    if (isUuid(filePath)) {
      return DashboardApiClient.saveDocumentUpdate(filePath, content);
    }

    return FileUtils.writeFile(filePath, content);
  }

}
