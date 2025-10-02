import chalk from 'chalk';
import cors from 'cors';
import express, { json } from 'express';
import open from 'open';

import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { ajv } from '../utils/ajv.js';

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

interface Credentials {
  accessToken: string;
  email: string;
  userId: string;
  expiry: string;
}

export class LoginOrchestrator {
  static async run() {
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

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        app.post('/', async (req, res) => {
          try {
            const body = req.body as Credentials;

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
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          console.error(chalk.red('Did not receive sign-in credentials in 5 minutes, please re-run the command'));
          resolve();
        }, 5 * 60 * 1000);
      })
    ])

    server.close(() => {});
  }
}
