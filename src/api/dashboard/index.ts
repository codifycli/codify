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
      throw new Error(`Error fetching document: ${res.statusText}`);
    }

    const json = await res.json();

    return json;
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

    const json = await res.json();
    if (!res.ok) {
      throw new Error(JSON.stringify(json, null, 2));
    }

    return json.defaultDocumentId;
  },

  async saveDocumentUpdate(id: string, contents: string): Promise<void> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }


  }
}
