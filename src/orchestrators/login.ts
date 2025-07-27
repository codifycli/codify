import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception';
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
    const server = new Hono();

    server.use('*', cors({ origin: config.corsAllowedOrigins }))
    server.post('/', async (c) => {
      const body = await c.req.json();
      if (!ajv.validate(schema, body)) {
        throw new HTTPException(400, { message: ajv.errorsText() })
      }

      await LoginOrchestrator.saveCredentials(body as unknown as Credentials)
      return c.text('Success', 200);
    });
    
    serve({
      fetch: server.fetch,
      port: config.loginServerPort,
    }, () => {
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
