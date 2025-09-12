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
    },
    email: {
      type: 'string',
    },
    userId: {
      type: 'string',
    },
    expiry: {
      type: 'number',
    }
  },
  additionalProperties: false,
  required: ['accessToken', 'email', 'userId', 'expiry'],
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
    app.use(json())

    const [, server] = await Promise.all([
      new Promise<void>((resolve) => {
        app.post('/', async (req, res) => {
          const body = req.body as Credentials;

          if (!ajv.validate(schema, body)) {
            return res.status(400).send({ message: ajv.errorsText() })
          }

          await LoginHelper.save(body);
          res.sendStatus(200);

          resolve();
        });
      }),
      app.listen(config.loginServerPort, () => {
        console.log('Opening CLI auth page...')
        open('http://localhost:3000/auth/cli');
      })
    ])

    server.close(() => {});
  }
}
