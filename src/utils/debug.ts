import { formatWithOptions } from 'node:util';

// Minimal replacement for the `debug` package: namespaced logs to stderr, enabled with DEBUG=<patterns>
// (comma or space separated, `*` wildcards, `-name` excludes). `enableDebug` sets process.env.DEBUG so child
// processes (plugins) inherit it, like `debug.enable()` does.

export type Debugger = ((...args: unknown[]) => void) & { enabled: boolean; namespace: string };

const COLORS = [6, 2, 3, 4, 5, 1];

export function enableDebug(namespaces: string): void {
  process.env.DEBUG = namespaces;
}

export function isDebugEnabled(namespace: string): boolean {
  const patterns = (process.env.DEBUG ?? '').split(/[\s,]+/).filter(Boolean);
  const matches = (pattern: string) =>
    new RegExp(`^${pattern.replaceAll(/[$()+.?[\\\]^{|}]/g, '\\$&').replaceAll('*', '.*?')}$`).test(namespace);

  if (patterns.some((p) => p.startsWith('-') && matches(p.slice(1)))) {
    return false;
  }

  return patterns.some((p) => !p.startsWith('-') && matches(p));
}

export function createDebug(namespace: string): Debugger {
  const hash = [...namespace].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const color = COLORS[Math.abs(hash) % COLORS.length];
  let previous: number | undefined;

  const log = (...args: unknown[]) => {
    if (!isDebugEnabled(namespace)) {
      return;
    }

    const now = Date.now();
    const elapsed = now - (previous ?? now);
    previous = now;

    const useColors = process.stderr.isTTY || process.env.DEBUG_COLORS === '1';
    const message = formatWithOptions({ colors: useColors }, ...args);
    const line = useColors
      ? message.split('\n').map((l) => `  \u001B[3${color};1m${namespace} \u001B[0m${l}`).join('\n') + ` \u001B[3${color}m+${elapsed}ms\u001B[0m`
      : `${new Date(now).toISOString()} ${namespace} ${message}`;

    process.stderr.write(line + '\n');
  };

  return Object.defineProperties(log, {
    enabled: { get: () => isDebugEnabled(namespace) },
    namespace: { value: namespace },
  }) as Debugger;
}
