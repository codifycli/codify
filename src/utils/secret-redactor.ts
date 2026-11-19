const MASK = '********';
// Values this short would mask ordinary words. They are still hidden in the plan (sensitive parameters).
const MIN_LENGTH = 4;
// How long a partial secret at the end of a chunk is held back, waiting for the rest of it
const HOLD_MS = 200;

/**
 * Hides the values of secrets in everything the CLI prints (logs, plugin output, errors). Secret values are
 * registered when they are resolved and stay registered for the life of the process.
 */
export const SecretRedactor = {
  values: new Set<string>(),

  register(value: string): void {
    if (value.length >= MIN_LENGTH) {
      this.values.add(value);
    }
  },

  clear(): void {
    this.values.clear();
  },

  get isActive(): boolean {
    return this.values.size > 0;
  },

  redact(text: string): string {
    if (this.values.size === 0) {
      return text;
    }

    // Longest first: a secret that contains another one is masked as a whole
    let result = text;
    for (const value of [...this.values].sort((a, b) => b.length - a.length)) {
      result = result.replaceAll(value, MASK);
    }

    return result;
  },

  /** Masks secrets in any value (strings at any depth). Used for JSON output. */
  redactValue<T>(value: T): T {
    if (this.values.size === 0) {
      return value;
    }

    if (typeof value === 'string') {
      return this.redact(value) as T;
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.redactValue(v)) as T;
    }

    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.redactValue(v)])) as T;
    }

    return value;
  },

  /**
   * A redacting writer for a stream of chunks (plugin output). A secret can be split across two chunks: when a chunk
   * ends with the beginning of a secret, that part is held back until the next chunk (or a short timeout) so the
   * whole value can be masked.
   */
  stream(write: (text: string) => void): (chunk: string) => void {
    let held = '';
    let timer: NodeJS.Timeout | undefined;

    const flush = () => {
      timer = undefined;
      if (held) {
        const text = held;
        held = '';
        write(this.redact(text));
      }
    };

    return (chunk: string) => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }

      const text = held + chunk;
      held = '';
      if (this.values.size === 0) {
        write(text);
        return;
      }

      const redacted = this.redact(text);
      const keep = partialSecretSuffix(redacted, this.values);
      if (keep > 0) {
        held = redacted.slice(-keep);
        write(redacted.slice(0, -keep));
        timer = setTimeout(flush, HOLD_MS);
        timer.unref?.();
      } else {
        write(redacted);
      }
    };
  },
};

/** Length of the longest end of the text that is the beginning of a secret (0 if none) */
function partialSecretSuffix(text: string, values: Set<string>): number {
  let longest = 0;
  for (const value of values) {
    for (let length = Math.min(value.length - 1, text.length); length > longest; length--) {
      if (text.endsWith(value.slice(0, length))) {
        longest = length;
        break;
      }
    }
  }

  return longest;
}
