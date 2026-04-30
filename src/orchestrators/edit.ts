import open from 'open';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { OsUtils } from '../utils/os-utils.js';
import { spawn } from '../utils/spawn.js';
import { ConnectOrchestrator } from './connect.js';

const DESKTOP_APP_PATHS = {
  darwin: '/Applications/Codify.app',
  linux: '/usr/bin/codify',
};

const DOWNLOAD_URLS: Record<string, Record<string, string>> = {
  darwin: {
    arm64: 'https://releases-desktop.codifycli.com/channels/stable/Codify_aarch64.dmg',
    x64: 'https://releases-desktop.codifycli.com/channels/stable/Codify_x64.dmg',
  },
  linux_deb: {
    arm64: 'https://releases-desktop.codifycli.com/channels/stable/Codify_arm64.deb',
    x64: 'https://releases-desktop.codifycli.com/channels/stable/Codify_amd64.deb',
  },
  linux_rpm: {
    aarch64: 'https://releases-desktop.codifycli.com/channels/stable/Codify_aarch64.rpm',
    x64: 'https://releases-desktop.codifycli.com/channels/stable/Codify_x86_64.rpm',
  },
};

async function getDesktopAppPath(): Promise<string | null> {
  const appPath = OsUtils.isMacOS()
    ? DESKTOP_APP_PATHS.darwin
    : OsUtils.isLinux()
      ? DESKTOP_APP_PATHS.linux
      : null;

  if (!appPath) return null;

  try {
    await fs.access(appPath);
    return appPath;
  } catch {
    return null;
  }
}

function getDownloadUrl(): { url: string; platform: 'darwin' | 'linux_deb' | 'linux_rpm' } | null {
  const arch = os.arch();

  if (OsUtils.isMacOS()) {
    return {
      url: DOWNLOAD_URLS.darwin[arch] ?? DOWNLOAD_URLS.darwin['x64'],
      platform: 'darwin',
    };
  }

  if (OsUtils.isLinux()) {
    const platform = OsUtils.isDebianBased() ? 'linux_deb' : 'linux_rpm';
    return {
      url: DOWNLOAD_URLS[platform][arch] ?? DOWNLOAD_URLS[platform]['x64'],
      platform,
    };
  }

  return null;
}

async function installDesktopApp(reporter: Reporter, url: string, platform: 'darwin' | 'linux_deb' | 'linux_rpm'): Promise<void> {
  const ext = url.split('.').pop()!;
  const tmpFile = path.join(tmpdir(), `codify-desktop.${ext}`);

  console.log('Downloading Codify desktop app...');
  await spawn(`curl -L -o ${tmpFile} ${url}`);

  if (platform === 'darwin') {
    const mountPoint = path.join(tmpdir(), 'codify-dmg-mount');
    try {
      console.log('Installing Codify desktop app...');
      await spawn(`hdiutil attach ${tmpFile} -mountpoint ${mountPoint} -nobrowse -quiet`);
      await spawn(`cp -R ${mountPoint}/Codify.app /Applications/Codify.app`);
    } finally {
      await spawn(`hdiutil detach ${mountPoint} -quiet`).catch(() => {});
      await fs.unlink(tmpFile).catch(() => {});
    }
  } else {
    const password = await reporter.promptSudo('codify-installer', {
      command: platform === 'linux_deb' ? `dpkg -i ${tmpFile}` : `rpm -i ${tmpFile}`,
      options: { requiresRoot: true },
    });

    if (password == null) {
      console.log('Installation cancelled.');
      return;
    }

    try {
      console.log('Installing Codify desktop app...');
      const cmd = platform === 'linux_deb' ? `dpkg -i ${tmpFile}` : `rpm -i ${tmpFile}`;
      await spawn(cmd, { requiresRoot: true }, undefined, password);
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  console.log('Codify desktop app installed successfully.');
}

export class EditOrchestrator {

  static async run(rootCommand: string, reporter: Reporter) {
    const desktopPath = await getDesktopAppPath();

    if (desktopPath) {
      await open(desktopPath);
      return;
    }

    const download = getDownloadUrl();
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
