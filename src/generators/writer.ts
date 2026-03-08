import { validate } from 'uuid'

import { DashboardApiClient } from '../api/dashboard/index.js';
import { FileUtils } from '../utils/file.js';

export class FileUpdater {
  static async write(filePath: string, content: string) {
    // Cloud file
    if (validate(filePath)) {
      return DashboardApiClient.saveDocumentUpdate(filePath, content);
    }

    return FileUtils.writeFile(filePath, content);
  }

}
