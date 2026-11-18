import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type ScriptChunk =
  | { input: unknown; name: string; id: string; type: 'server-tool' | 'tool' }
  | { text: string; type: 'error' | 'text' };

export interface RecordedRequest {
  method: string;
  url: string;
  authorization?: string;
  apikey?: string;
  body?: any;
}

/**
 * Stands in for the services `codify prompt` talks to: Supabase anonymous sign-in, the Mastra memory API and the
 * agent's /chat endpoint, which plays back one scripted turn per request as an AI SDK UI message stream.
 */
export async function startFakeAgent(script: ScriptChunk[][]) {
  const requests: RecordedRequest[] = [];
  const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ sub: 'anon-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  let turn = 0;
  let assistantCount = 0;

  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method!, url: req.url!, authorization: req.headers.authorization, apikey: req.headers.apikey as string, body });

    const json = (value: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };

    if (req.url!.startsWith('/auth/v1/signup')) {
      return json({ access_token: token, refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }

    if (req.method === 'POST' && req.url!.startsWith('/api/memory/threads')) {
      return json({ id: 'thread-e2e', title: body.title });
    }

    if (req.url!.startsWith('/chat/')) {
      const chunks = script[turn++] ?? [{ type: 'text', text: 'END OF SCRIPT' }];
      if (body.messages.at(-1).role === 'user') assistantCount++;

      res.writeHead(200, { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' });
      const write = (chunk: object) => res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      write({ type: 'start', messageId: `assistant-${assistantCount}` });
      write({ type: 'start-step' });
      for (const chunk of chunks) {
        switch (chunk.type) {
          case 'text': {
            write({ type: 'text-start', id: `t${turn}` });
            write({ type: 'text-delta', id: `t${turn}`, delta: chunk.text });
            write({ type: 'text-end', id: `t${turn}` });
            break;
          }

          case 'tool': {
            write({ type: 'tool-input-available', toolCallId: chunk.id, toolName: chunk.name, input: chunk.input });
            break;
          }

          case 'server-tool': {
            write({ type: 'tool-input-available', toolCallId: chunk.id, toolName: chunk.name, input: chunk.input });
            write({ type: 'tool-output-available', toolCallId: chunk.id, output: chunk.input });
            break;
          }

          case 'error': {
            write({ type: 'error', errorText: chunk.text });
            break;
          }
        }
      }

      write({ type: 'finish-step' });
      write({ type: 'finish' });
      res.end('data: [DONE]\n\n');
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;

  return {
    url,
    requests,
    chatRequests: () => requests.filter((r) => r.url.startsWith('/chat/')),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
