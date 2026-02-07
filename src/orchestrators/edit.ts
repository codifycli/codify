import { Config } from '@oclif/core';
import open from 'open';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { ConnectOrchestrator } from './connect.js';
import { LoginOrchestrator } from './login.js';

export class EditOrchestrator {

  static async run(rootCommand: string, reporter: Reporter) {
    const login = LoginHelper.get()?.isLoggedIn;
    if (!login) {
      console.log('User is not logged in. Attempting to log in...')
      await LoginOrchestrator.run();
    }

    let defaultDocumentId: null | string = null;
    try {
      defaultDocumentId = await DashboardApiClient.getDefaultDocumentId();
    } catch {
      console.warn('Mismatch accounts between local and dashboard. Cannot open default document')
    }

    const url = defaultDocumentId
      ? `${config.dashboardUrl}/document/${defaultDocumentId}`
      : config.dashboardUrl;

    await ConnectOrchestrator.run(rootCommand, reporter, false, (code) => {
      open(`${url}?connection_code=${code}`);
      console.log(
`Opening default Codify file:
${url}?connection_code=${code}

Starting connection. If unsuccessful, manually enter the code:
${code}`)
    });
  }
}
