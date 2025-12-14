import chalk from 'chalk';
import cors from 'cors';
import express, { json } from 'express';
import open from 'open';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { ajv } from '../utils/ajv.js';
import { registerKillListeners } from '../utils/register-kill-listeners.js';

const schema = {
  type: 'object',
  properties: {
    accessToken: {
      type: 'string',
    }
  },
  additionalProperties: false,
  required: ['accessToken'],
}

export interface LoginArgs {
  username?: string;
  password?: string;
}

export class LoginOrchestrator {
  static async run(args?: LoginArgs) {
    if (args?.username && !args?.password) {
      console.error(chalk.red('Password is required when providing a username'));
      process.exit(1);
    }

    if (args?.password && !args?.username) {
      console.error(chalk.red('Username is required when providing a password'));
      process.exit(1);
    }

    if (args?.username && args?.password) {
      return this.loginWithCredentials(args.username, args.password);
    }

    return this.loginViaBrowser();
  }

  private static async loginWithCredentials(username: string, password: string) {
    try {
      const accessToken = await DashboardApiClient.login(username, password);
      await LoginHelper.save(accessToken);
    } catch (e) {
      console.error(chalk.red(JSON.parse(e.message).error));

      process.exit(1);
    }
  }

  private static async loginViaBrowser() {

    const app = express();

    app.use(cors({ origin: config.corsAllowedOrigins }))
    app.use(json());

    const server = app.listen(config.loginServerPort, (error) => {
      if (error) {
        console.error(chalk.red('Something went wrong. Only a single instance of codify login can be run at the same time. Please terminate the other process and try again.'));
        process.exit(1);
      }

      console.log(
        `Opening CLI auth page...
Manually open it here: ${config.dashboardUrl}/auth/cli`
      )
      open(`${config.dashboardUrl}/auth/cli`);
    })

    registerKillListeners(() => server.close());

    await new Promise<void>((resolve, reject) => {
      app.post('/', async (req, res) => {
        try {
          const body = req.body as { accessToken: string };

          if (!ajv.validate(schema, body)) {
            console.error(chalk.red('Received invalid credentials. Please submit a support ticket'))
            return res.status(400).send({ message: ajv.errorsText() })
          }

          console.log(chalk.green('\nSuccessfully received sign-in credentials...'))

          await LoginHelper.save(body.accessToken);
          res.sendStatus(200);

          resolve();
        } catch (error) {
          console.error(error);
          reject(error);
        }
      });
    })

    server.close(() => {});
  }
}
