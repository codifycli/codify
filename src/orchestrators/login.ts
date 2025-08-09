import cors from 'cors';
import express, { json } from 'express';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import open from 'open';

import { config } from '../config.js';
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
      type: 'string',
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
  static async run(){
    const app = express();

    app.use(cors({ origin: config.corsAllowedOrigins }))
    app.use(json())

    app.post('/', async (req, res) => {
      const body = req.body as Credentials;
      if (!ajv.validate(schema, body)) {
        return res.status(400).send({ message: ajv.errorsText() })
      }

      await LoginOrchestrator.saveCredentials(body)
      return res.sendStatus(200);
    });

    app.listen(config.loginServerPort, () => {
      console.log('Opening CLI auth page...')
      open('http://localhost:3000/auth/cli');
    })
  }

  private static async saveCredentials(credentials: Credentials) {
    const credentialsPath = path.join(os.homedir(), '.codify', 'credentials.json');
    console.log(`Saving credentials to ${credentialsPath}`);
    await fs.writeFile(credentialsPath, JSON.stringify(credentials));
  }
}
