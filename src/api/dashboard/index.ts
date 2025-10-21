import { config } from '../../config.js';
import { LoginHelper } from '../../connect/login-helper.js';
import { CloudDocument } from './types.js';

export const DashboardApiClient = {
  async getDocument(id: string): Promise<CloudDocument> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }

    const res = await fetch(
      `${config.dashboardUrl}/api/v1/documents/${id}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${login.accessToken}` } },
    );

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message);
    }

    const json = await res.json();
    return json.defaultDocumentId;
  },

  async getDefaultDocumentId(): Promise<null | string> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }

    const res = await fetch(
      `${config.dashboardUrl}/api/v1/documents/default/id`,
      { method: 'GET', headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${login.accessToken}` } },
    );

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message);
    }

    const json = await res.json();
    return json.defaultDocumentId;
  },

  async saveDocumentUpdate(id: string, contents: string): Promise<void> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }


  }
}
