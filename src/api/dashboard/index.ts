import { LoginHelper } from '../../connect/login-helper.js';
import { CloudDocument } from './types.js';

const API_BASE_URL = 'http://localhost:3000'

export const DashboardApiClient = {
  async getDocument(id: string): Promise<CloudDocument> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }

    const res = await fetch(
      `${API_BASE_URL}/api/v1/documents/${id}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json', 'authorization': login.accessToken } },
    );

    const json = await res.json();
    if (!res.ok) {
      throw new Error(JSON.stringify(json, null, 2));
    }

    return json;
  },

  async getDefaultDocumentId(): Promise<string> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }

    // const res = await fetch(
    //   `${API_BASE_URL}/api/v1/documents/default/id`,
    //   { method: 'GET', headers: { 'Content-Type': 'application/json', 'authorization': login.accessToken } },
    // );

    // const json = await res.json();
    // if (!res.ok) {
    //   throw new Error(JSON.stringify(json, null, 2));
    // }

    return '1b80818e-5304-4158-80a3-82e17ff2c79e';
  },

  async saveDocumentUpdate(id: string, contents: string): Promise<void> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }


  }
}
