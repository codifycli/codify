import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';

// A small replacement for the parts of express (+ cors and the json body parser) used by `codify connect` and
// `codify login`: method + path routing with `:params`, mounted routers, JSON bodies, CORS for a list of origins,
// and errors (thrown or rejected) returned as `500 { error }`.

export interface Request {
  body: Record<string, any>;
  headers: IncomingMessage['headers'];
  method: string;
  params: Record<string, string>;
  path: string;
  raw: IncomingMessage;
  header(name: string): string | undefined;
}

export interface Response {
  raw: ServerResponse;
  /** Sends the data as JSON (no body for 204 and 304). */
  json(data: unknown): void;
  /** Ends the response without a body. */
  end(): void;
  set(name: string, value: string): Response;
  status(code: number): Response;
}

export type Handler = (req: Request, res: Response) => unknown;

/** Runs before the routes. Return false (after responding) to stop the request. */
export type Middleware = (req: Request, res: Response) => boolean;

interface Route {
  handler: Handler;
  keys: string[];
  method: string;
  pattern: RegExp;
  path: string;
}

export class Router {
  private routes: Route[] = [];

  get(path: string, handler: Handler): this {
    return this.add('GET', path, handler);
  }

  post(path: string, handler: Handler): this {
    return this.add('POST', path, handler);
  }

  /** Mounts the routes of another router under a prefix. */
  use(prefix: string, router: Router): this {
    for (const route of router.routes) {
      this.add(route.method, joinPaths(prefix, route.path), route.handler);
    }

    return this;
  }

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | 'method-not-allowed' | undefined {
    let pathMatched = false;
    for (const route of this.routes) {
      const match = route.pattern.exec(path);
      if (!match) {
        continue;
      }

      pathMatched = true;
      if (route.method !== method && !(method === 'HEAD' && route.method === 'GET')) {
        continue;
      }

      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      return { handler: route.handler, params };
    }

    return pathMatched ? 'method-not-allowed' : undefined;
  }

  private add(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const source = path
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1));
          return '([^/]+)';
        }

        return segment.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&');
      })
      .join('/');

    // Like express: case insensitive and an optional trailing slash
    this.routes.push({ handler, keys, method, path, pattern: new RegExp(`^${source || '/'}/?$`, 'i') });
    return this;
  }
}

export interface HttpAppOptions {
  /** Origins allowed by CORS. Requests from other origins still run but the browser can't read the response. */
  corsOrigins: string[];
  /** Maximum JSON body size in bytes (default 10 MB). */
  bodyLimit?: number;
  middleware?: Middleware[];
  /** Errors thrown by a handler (or a rejected promise) are logged here and answered with 500 { error }. */
  onError?: (error: Error) => void;
}

/** Creates an http server that serves the router. Listen with `listen()` below. */
export function createHttpApp(router: Router, options: HttpAppOptions): Server {
  return createServer((rawReq, rawRes) => {
    handleRequest(router, options, rawReq, rawRes).catch((error) => {
      sendError(rawRes, error, options);
    });
  });
}

/** Listens on the port. Rejects with the server error (ex: EADDRINUSE) instead of emitting it. */
export function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

async function handleRequest(router: Router, options: HttpAppOptions, rawReq: IncomingMessage, rawRes: ServerResponse): Promise<void> {
  const res = createResponse(rawRes);
  const url = new URL(rawReq.url ?? '/', 'http://localhost');
  const method = (rawReq.method ?? 'GET').toUpperCase();

  // Lets the dashboard (a public https page) call this server on localhost (Chrome private network access)
  res.set('Access-Control-Allow-Private-Network', 'true');
  if (applyCors(rawReq, res, options.corsOrigins, method)) {
    return;
  }

  const req: Request = {
    body: {},
    header: (name) => {
      const value = rawReq.headers[name.toLowerCase()];
      return Array.isArray(value) ? value.join(', ') : value;
    },
    headers: rawReq.headers,
    method,
    params: {},
    path: url.pathname,
    raw: rawReq,
  };

  for (const middleware of options.middleware ?? []) {
    if (!middleware(req, res)) {
      return;
    }
  }

  const match = router.match(method, url.pathname);
  if (!match || match === 'method-not-allowed') {
    res.status(match ? 405 : 404).json({ error: `Cannot ${method} ${url.pathname}` });
    return;
  }

  try {
    req.body = await readJsonBody(rawReq, options.bodyLimit ?? 10 * 1024 * 1024);
  } catch (error) {
    res.status((error as HttpError).statusCode ?? 400).json({ error: (error as Error).message });
    return;
  }

  req.params = match.params;
  await match.handler(req, res);
}

// Same behavior as the `cors` package with a list of origins
function applyCors(rawReq: IncomingMessage, res: Response, allowedOrigins: string[], method: string): boolean {
  const { origin } = rawReq.headers;
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }

  const vary = ['Origin'];
  if (method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    const requestedHeaders = rawReq.headers['access-control-request-headers'];
    if (requestedHeaders) {
      res.set('Access-Control-Allow-Headers', requestedHeaders);
      vary.push('Access-Control-Request-Headers');
    }
  }

  res.set('Vary', vary.join(', '));

  if (method === 'OPTIONS') {
    res.raw.setHeader('Content-Length', '0');
    res.status(204).end();
    return true;
  }

  return false;
}

class HttpError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

async function readJsonBody(rawReq: IncomingMessage, limit: number): Promise<Record<string, any>> {
  const contentType = rawReq.headers['content-type'] ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    // Drain the body so the connection can be reused
    rawReq.resume();
    return {};
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of rawReq) {
    size += (chunk as Buffer).length;
    if (size > limit) {
      throw new HttpError('Request body is too large', 413);
    }

    chunks.push(chunk as Buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new HttpError(`Invalid JSON body: ${(error as Error).message}`, 400);
  }

  // Like body-parser's strict mode: only objects and arrays
  if (parsed === null || typeof parsed !== 'object') {
    throw new HttpError('Invalid JSON body: expected an object or an array', 400);
  }

  return parsed as Record<string, any>;
}

function createResponse(raw: ServerResponse): Response {
  const res: Response = {
    end() {
      raw.end();
    },
    json(data: unknown) {
      if (raw.statusCode === 204 || raw.statusCode === 304) {
        raw.end();
        return;
      }

      raw.setHeader('Content-Type', 'application/json; charset=utf-8');
      raw.end(JSON.stringify(data));
    },
    raw,
    set(name, value) {
      raw.setHeader(name, value);
      return res;
    },
    status(code) {
      raw.statusCode = code;
      return res;
    },
  };

  return res;
}

function sendError(raw: ServerResponse, error: unknown, options: HttpAppOptions): void {
  const err = error instanceof Error ? error : new Error(String(error));
  options.onError?.(err);

  if (raw.headersSent) {
    raw.end();
    return;
  }

  raw.statusCode = 500;
  raw.setHeader('Content-Type', 'application/json; charset=utf-8');
  raw.end(JSON.stringify({ error: err.message }));
}

function joinPaths(prefix: string, path: string): string {
  const joined = `${prefix.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  return joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
}
