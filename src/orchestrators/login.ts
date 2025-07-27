import * as fs from 'node:fs/promises';
import { type IncomingMessage, ServerResponse, createServer } from 'node:http';
import * as os from 'node:os';
import path from 'node:path';
import open from 'open';

export class LoginOrchestrator {
  static async run(){
    const server = createServer((req, res) => {
      LoginOrchestrator.handleRequests(req, res);
    });

    server.listen(51_039, 'localhost', () => {
      console.log('Opening CLI auth page...')
      open('http://localhost:3000/auth/cli');
    })
  }

  private static async handleRequests(req: IncomingMessage, res: ServerResponse<IncomingMessage>) {
    try {
      if (req.method !== 'POST') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return;
      }

      const json = await new Promise((resolve) => {
        const buf = new Array<Uint8Array>()
        req.on('data', (chunk) => {
          buf.push(chunk);
        }).on('end', () => {
          const body = Buffer.concat(buf).toString();
          const json = JSON.parse(body);
          resolve(json);
        }).on('error', (err) => {
          console.error(err);
        })
      });

      const credentialsPath = path.join(os.homedir(), '.codify', 'credentials.json');
      console.log(`Saving credentials to ${credentialsPath}`);
      await fs.writeFile(credentialsPath, JSON.stringify(json));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      process.exit(0);
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      process.exit(1);
    }
  }
}
