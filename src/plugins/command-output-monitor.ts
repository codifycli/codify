import { stripVTControlCharacters } from 'node:util';

import { ctx, Event } from '../events/context.js';
import { VerbosityLevel } from '../utils/verbosity-level.js';

/** Env var that asks plugins (plugin-core >= 2.2.0) to send all command output over IPC (see PluginProcess) */
export const FORWARD_COMMAND_OUTPUT_ENV = 'CODIFY_FORWARD_COMMAND_OUTPUT';

/** IPC message plugins send command output with: `{ data: string }`, no reply */
export const COMMAND_OUTPUT_MESSAGE_CMD = 'command_output';

/** A resource apply taking longer than this shows its output */
export const SLOW_RESOURCE_AFTER_MS = 60_000;

/** Silence after a line that looks like a prompt before warning that the command may be waiting for input */
export const PROMPT_IDLE_MS = 15_000;

/** Number of earlier lines shown when the output of a resource is revealed */
export const REPLAY_LINES = 20;

// Endings of lines that ask for input: `Continue? [y/N]`, `Password:`, `(yes/no/[fingerprint])?`, `Press RETURN to continue`
const PROMPT_PATTERN = /(?:[?:]|\[y\/n]|\(y\/n\)|\[yes\/no]|\(yes\/no\)|password|passphrase|press\s+(?:return|enter|any key)\b.*)$/i;

export function isPromptLike(line: string): boolean {
  return PROMPT_PATTERN.test(line.trim());
}

export type WatchHooks = {
  /**
   * Called when the output of the resource is revealed. Plugins built before plugin-core 2.2.0 do not forward their
   * output, so the caller raises their verbosity instead.
   */
  onReveal?(): Promise<void> | void;
  /** Called when a revealed resource finishes, unless verbose mode is on */
  onHide?(): Promise<void> | void;
};

/**
 * Decides what to show of the output of the commands plugins run (Event.PLUGIN_COMMAND_OUTPUT).
 *
 * It is shown in verbose mode. Otherwise it is hidden, but the last lines of the resource being applied are kept: if
 * the apply takes longer than SLOW_RESOURCE_AFTER_MS, or the output stops on something that looks like a prompt for
 * PROMPT_IDLE_MS, a warning and the last REPLAY_LINES lines are shown, then the output of that resource as it comes.
 * The output is hidden again for the next resource.
 */
export class CommandOutputMonitor {
  private attached = false;
  private resource: undefined | WatchedResource;

  /** Starts listening to command output (idempotent) */
  attach(): void {
    if (this.attached) {
      return;
    }

    this.attached = true;
    ctx.on(Event.PLUGIN_COMMAND_OUTPUT, this.onOutput);
  }

  detach(): void {
    if (!this.attached) {
      return;
    }

    this.attached = false;
    ctx.off(Event.PLUGIN_COMMAND_OUTPUT, this.onOutput);
  }

  /** Starts watching the apply of a resource. Call finish() on the result when the apply ends (success or not). */
  watch(id: string, hooks: WatchHooks = {}): { finish(): Promise<void> } {
    this.resource?.stop();

    const resource = new WatchedResource(id, hooks);
    this.resource = resource;

    return {
      finish: async () => {
        resource.stop();
        if (this.resource === resource) {
          this.resource = undefined;
        }

        if (resource.revealed && !isVerbose()) {
          try {
            await hooks.onHide?.();
          } catch {
            // Best effort: only affects plugins built before plugin-core 2.2.0
          }
        }
      },
    };
  }

  private readonly onOutput = (_pluginName: string, data: unknown) => {
    const text = String(data);
    const { resource } = this;
    resource?.record(text);

    if (isVerbose() || resource?.revealed) {
      ctx.emitter.emit(Event.OUTPUT, text);
    }
  };
}

export const commandOutputMonitor = new CommandOutputMonitor();

function isVerbose(): boolean {
  return VerbosityLevel.get() > 0;
}

class WatchedResource {
  revealed = false;

  private readonly lines: string[] = [];
  private partial = '';
  private promptWarned = false;
  private stopped = false;
  private slowTimer: NodeJS.Timeout | undefined;
  private idleTimer: NodeJS.Timeout | undefined;

  constructor(readonly id: string, private readonly hooks: WatchHooks) {
    this.slowTimer = setTimeout(() => {
      this.onSlow();
    }, SLOW_RESOURCE_AFTER_MS);
    this.slowTimer.unref?.();
  }

  record(chunk: string): void {
    const parts = (this.partial + stripVTControlCharacters(chunk)).split(/\r?\n/);
    this.partial = parts.pop() ?? '';

    for (const part of parts) {
      const line = lastSegment(part);
      if (line.trim()) {
        this.lines.push(line);
      }
    }

    if (this.lines.length > REPLAY_LINES) {
      this.lines.splice(0, this.lines.length - REPLAY_LINES);
    }

    this.resetIdleTimer();
  }

  stop(): void {
    this.stopped = true;
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.slowTimer = undefined;
    this.idleTimer = undefined;
  }

  /** Last lines, including the line in progress (prompts usually don't end with a newline) */
  private recentLines(): string[] {
    const current = lastSegment(this.partial);
    return (current.trim() ? [...this.lines, current] : this.lines).slice(-REPLAY_LINES);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (this.stopped || this.promptWarned) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      this.onIdle();
    }, PROMPT_IDLE_MS);
    this.idleTimer.unref?.();
  }

  private onSlow(): void {
    this.slowTimer = undefined;
    if (this.stopped || this.revealed || isVerbose()) {
      return;
    }

    const lines = this.recentLines();
    ctx.warn(lines.length > 0
      ? `${this.id} is taking more than a minute. Its last output:`
      : `${this.id} is taking more than a minute. Showing its output (none so far).`);
    this.reveal(lines);
  }

  private onIdle(): void {
    this.idleTimer = undefined;
    if (this.stopped) return;

    const lines = this.recentLines();
    if (this.promptWarned || lines.length === 0 || !isPromptLike(lines.at(-1)!)) {
      return;
    }

    this.promptWarned = true;
    const message = `${this.id} may be waiting for input, which Codify can't answer for it. Press Ctrl+C to stop.`;

    if (this.revealed || isVerbose()) {
      ctx.warn(message);
      return;
    }

    ctx.warn(`${message} Its last output:`);
    this.reveal(lines);
  }

  private reveal(lines: string[]): void {
    if (lines.length > 0) {
      ctx.emitter.emit(Event.OUTPUT, lines.join('\n') + '\n');
    }

    this.revealed = true;
    // eslint-disable-next-line unicorn/prefer-promise-try -- Promise.try needs Node 24
    Promise.resolve()
      .then(async () => this.hooks.onReveal?.())
      .catch(() => {
        // Best effort: only affects plugins built before plugin-core 2.2.0
      });
  }
}

/** Text after the last carriage return: what a terminal shows for progress bars that redraw a line */
function lastSegment(line: string): string {
  const segments = line.split('\r');
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].trim()) return segments[i];
  }

  return '';
}
