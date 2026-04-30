import open from 'open';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { getDesktopAppPath, getDesktopDownloadUrl, installDesktopApp } from '../utils/desktop-installer.js';
import { ConnectOrchestrator } from './connect.js';

export class EditOrchestrator {

  static async run(rootCommand: string, reporter: Reporter) {
    const desktopPath = await getDesktopAppPath();

    if (desktopPath) {
      await open(desktopPath);
      return;
    }

    const download = getDesktopDownloadUrl();
    if (download) {
      const shouldInstall = await reporter.promptConfirmation(
        'Codify desktop app is not installed. Would you like to download and install it?'
      );

      await reporter.hide();

      if (shouldInstall) {
        await installDesktopApp(reporter, download.url, download.platform);
        const installedPath = await getDesktopAppPath();
        if (installedPath) {
          await open(installedPath);
        }
        return;
      }
    }

    await EditOrchestrator.openDashboard(rootCommand, reporter);
  }

  private static async openDashboard(rootCommand: string, reporter: Reporter) {
    const isLoggedIn = LoginHelper.get()?.isLoggedIn;

    let defaultDocumentId: null | string = null;
    if (isLoggedIn) {
      try {
        defaultDocumentId = await DashboardApiClient.getDefaultDocumentId();
      } catch {
        // ignore — just open homepage
      }
    }

    const url = defaultDocumentId
      ? `${config.dashboardUrl}/document/${defaultDocumentId}`
      : config.dashboardUrl;

    await ConnectOrchestrator.run(rootCommand, reporter, false, (code) => {
      open(`${url}?connection_code=${code}`);
      console.log(
`Opening Codify dashboard:
${url}?connection_code=${code}

Starting connection. If unsuccessful, manually enter the code:
${code}`);
    });
  }
}
