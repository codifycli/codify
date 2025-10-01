import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { config } from '../config.js';

interface Credentials {
  accessToken: string;
  email: string;
  userId: string;
  expiry: number;
}

const PROJECT_JWKS = createRemoteJWKSet(
  new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`)
)

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

    console.log('My credentials', credentials);
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

  static async save(accessToken: string) {
    const credentialsPath = path.join(os.homedir(), '.codify', 'credentials.json');
    console.log(`Saving credentials to ${credentialsPath}`);
    await fs.writeFile(credentialsPath, JSON.stringify({ accessToken }));
  }

  private static async read(): Promise<Credentials | undefined> {
    const credentialsPath = path.join(os.homedir(), '.codify', 'credentials.json');
    try {
      const credentialsStr = await fs.readFile(credentialsPath, 'utf8');
      const { accessToken } = JSON.parse(credentialsStr);

      await LoginHelper.verifyProjectJWT(accessToken);
      const decoded = decodeJwt(accessToken);

      return {
        accessToken,
        email: decoded.email as string,
        userId: decoded.sub!,
        expiry: decoded.exp!,
      }
    } catch(e) {
      console.error(e);
      return undefined;
    }
  }

  private static async verifyProjectJWT(jwt: string) {
    return jwtVerify(jwt, PROJECT_JWKS)
  }
}
