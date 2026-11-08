import { config } from '../../config.js';
import { LoginHelper } from '../../connect/login-helper.js';
import { RemoteDocument, RegistryTemplate } from './types.js';
import { UnauthorizedError } from '../../common/errors.js';

export const DashboardApiClient = {
  async getDocument(id: string): Promise<RemoteDocument> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }

    // The api worker owns the Yjs decode and returns { id, contents }.
    const res = await fetch(
      `${config.apiUrl}/v1/documents/${id}/contents`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${login.accessToken}` }
      },
    );

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message);
    }

    const json = await res.json();
    return json as RemoteDocument;
  },

  /**
   * Fetch a public template by exact name or id. Does not require login.
   * Returns null if no template matches.
   */
  async getTemplate(nameOrId: string): Promise<null | RegistryTemplate> {
    const res = await fetch(
      `${config.apiUrl}/v1/templates/${encodeURIComponent(nameOrId)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
    );

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const message = await res.text();
      throw new Error(`Unable to fetch template "${nameOrId}": ${message}`);
    }

    return await res.json() as RegistryTemplate;
  },

  async getDefaultDocumentId(): Promise<null | string> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }

    const res = await fetch(
      `${config.dashboardUrl}/api/v1/documents/default/id`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${login.accessToken}` }
      },
    );

    if (!res.ok) {
      console.log('Request not okay', res.status)
      const message = await res.text();
      if (res.status === 401) {
        console.log('Unauthorized');
        throw new UnauthorizedError({ requestName: 'getDefaultDocumentId' });
      }

      throw new Error(message);
    }

    const json = await res.json();
    return json.defaultDocumentId;
  },

  async login(email: string, password: string): Promise<string> {
    const res = await fetch(
      `${config.dashboardUrl}/api/v1/auth/cli`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          email,
          password,
        })
      },
    );

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message);
    }

    const json = await res.json();
    return json.accessToken;
  },

  async saveDocumentUpdate(id: string, contents: string): Promise<void> {
    const login = LoginHelper.get()?.credentials;
    if (!login) {
      throw new Error('Not logged in');
    }
  }
}
