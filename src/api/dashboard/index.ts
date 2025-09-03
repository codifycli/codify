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
      `${API_BASE_URL}/api/documents/${id}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json', 'authorization': login.accessToken } },
    );

    const json = await res.json();
    if (!res.ok) {
      throw new Error(JSON.stringify(json, null, 2));
    }

    return json;
  }
}
