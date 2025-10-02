import { Config } from '@oclif/core';
import { randomBytes } from 'node:crypto';
import open from 'open';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { ConnectOrchestrator } from './connect.js';
import { LoginOrchestrator } from './login.js';

export class EditOrchestrator {
  static rootCommand: string;

  static async run(oclifConfig: Config) {
    const login = LoginHelper.get()?.isLoggedIn;
    if (!login) {
      console.log('User is not logged in. Attempting to log in...')
      await LoginOrchestrator.run();
    }

    const defaultDocumentId = await DashboardApiClient.getDefaultDocumentId();
    const url = defaultDocumentId
      ? `${config.dashboardUrl}/file/${defaultDocumentId}`
      : config.dashboardUrl;

    await ConnectOrchestrator.run(oclifConfig, false, (code) => {
      open(`${url}?connection_code=${code}`);
      console.log(
`Opening default Codify file:
${url}?connection_code=${code}

Starting connection. If unsuccessful, manually enter the code:
${code}`)
    });
  }
}
