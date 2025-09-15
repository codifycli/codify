import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

interface Credentials {
  accessToken: string;
  email: string;
  userId: string;
  expiry: string;
}

export class LoginHelper {
  private static instance: LoginHelper;

  private constructor(
    public isLoggedIn: boolean,
    public credentials?: Credentials
  ) {};

  static async load(): Promise<LoginHelper> {
    if (LoginHelper.instance) {
      return LoginHelper.instance;
    }

    const credentials = await LoginHelper.read();
    if (!credentials) {
      LoginHelper.instance = new LoginHelper(false);
      return LoginHelper.instance;
    }

    if (new Date(credentials.expiry).getTime() < Date.now()) {
      LoginHelper.instance = new LoginHelper(false);
      return LoginHelper.instance;
    }

    LoginHelper.instance = new LoginHelper(true, credentials);
    return LoginHelper.instance;
  }

  static get(): LoginHelper | undefined {
    return LoginHelper.instance;
  }

  static async save(credentials: Credentials) {
    const credentialsPath = path.join(os.homedir(), '.codify', 'credentials.json');
    console.log(`Saving credentials to ${credentialsPath}`);
    await fs.writeFile(credentialsPath, JSON.stringify(credentials));
  }

  private static async read(): Promise<Credentials | undefined> {
    const credentialsPath = path.join(os.homedir(), '.codify', 'credentials.json');
    try {
      const credentialsStr = await fs.readFile(credentialsPath, 'utf8');
      return JSON.parse(credentialsStr);
    } catch {
      return undefined;
    }
  }
}
