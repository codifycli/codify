import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

const PROXY_VARIABLES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

let configured = false;

/**
 * Node's fetch ignores HTTP(S)_PROXY. When one is set, route every fetch of the CLI (updates, plugin downloads, the
 * dashboard API, the agent chat, ...) through it. NO_PROXY is respected.
 */
export function configureProxyFromEnv(): void {
  if (configured || !PROXY_VARIABLES.some((name) => process.env[name])) {
    return;
  }

  setGlobalDispatcher(new EnvHttpProxyAgent());
  configured = true;
}
