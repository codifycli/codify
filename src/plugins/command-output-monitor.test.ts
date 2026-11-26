import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ctx, Event } from '../events/context.js';
import { VerbosityLevel } from '../utils/verbosity-level.js';
import {
  CommandOutputMonitor,
  PROMPT_IDLE_MS,
  REPLAY_LINES,
  SLOW_RESOURCE_AFTER_MS,
  isPromptLike,
} from './command-output-monitor.js';

describe('CommandOutputMonitor', () => {
  let monitor: CommandOutputMonitor;
  let shown: string[];
  let warnings: string[];
  const onOutput = (text: string) => shown.push(text);
  const onWarning = (text: string) => warnings.push(text);

  beforeEach(() => {
    vi.useFakeTimers();
    VerbosityLevel.set(0);
    monitor = new CommandOutputMonitor();
    monitor.attach();
    shown = [];
    warnings = [];
    ctx.on(Event.OUTPUT, onOutput);
    ctx.on(Event.WARNING, onWarning);
  });

  afterEach(() => {
    monitor.detach();
    ctx.off(Event.OUTPUT, onOutput);
    ctx.off(Event.WARNING, onWarning);
    VerbosityLevel.set(0);
    vi.useRealTimers();
  });

  const output = (text: string) => ctx.emitter.emit(Event.PLUGIN_COMMAND_OUTPUT, 'default', text);

  it('Hides command output in non-verbose mode and shows it in verbose mode', async () => {
    output('hidden\n');
    expect(shown).toEqual([]);

    VerbosityLevel.set(3);
    output('visible\n');
    expect(shown).toEqual(['visible\n']);
  });

  it('Shows a warning, the last lines and the following output of a resource that takes more than a minute', async () => {
    const onReveal = vi.fn();
    const onHide = vi.fn();
    const handle = monitor.watch('homebrew', { onHide, onReveal });

    for (let i = 1; i <= 30; i++) {
      output(`line ${i}\n`);
    }

    output('Downloading 10%\rDownloading 50%');
    expect(shown).toEqual([]);

    await vi.advanceTimersByTimeAsync(SLOW_RESOURCE_AFTER_MS);

    expect(warnings).toEqual(['homebrew is taking more than a minute. Its last output:']);
    const expectedLines = [...Array.from({ length: REPLAY_LINES - 1 }, (_, i) => `line ${i + 12}`), 'Downloading 50%'];
    expect(shown).toEqual([expectedLines.join('\n') + '\n']);
    expect(onReveal).toHaveBeenCalledOnce();

    output('Downloading 100%\n');
    expect(shown.at(-1)).toEqual('Downloading 100%\n');

    await handle.finish();
    expect(onHide).toHaveBeenCalledOnce();

    // The next resource is hidden again
    monitor.watch('git');
    output('next\n');
    expect(shown.at(-1)).toEqual('Downloading 100%\n');
  });

  it('Does not warn for resources that finish within a minute', async () => {
    const onReveal = vi.fn();
    const handle = monitor.watch('nvm', { onReveal });
    output('Installing...\n');

    await vi.advanceTimersByTimeAsync(SLOW_RESOURCE_AFTER_MS - 1);
    await handle.finish();
    await vi.advanceTimersByTimeAsync(SLOW_RESOURCE_AFTER_MS);

    expect(warnings).toEqual([]);
    expect(shown).toEqual([]);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('Warns early when the output stops on a prompt', async () => {
    monitor.watch('pyenv');
    output('Installing Python 3.12\n');
    output('Do you want to continue? [y/N] ');

    await vi.advanceTimersByTimeAsync(PROMPT_IDLE_MS);

    expect(warnings).toEqual([
      'pyenv may be waiting for input, which Codify can\'t answer for it. Press Ctrl+C to stop. Its last output:',
    ]);
    expect(shown).toEqual(['Installing Python 3.12\nDo you want to continue? [y/N] \n']);

    // Only once, and no second warning when it reaches a minute
    output('Password:');
    await vi.advanceTimersByTimeAsync(SLOW_RESOURCE_AFTER_MS);
    expect(warnings).toHaveLength(1);
    expect(shown.at(-1)).toEqual('Password:');
  });

  it('Does not warn about prompts while output keeps coming or when the last line is not a prompt', async () => {
    monitor.watch('homebrew');
    output('Continue? ');
    await vi.advanceTimersByTimeAsync(PROMPT_IDLE_MS - 1);
    output('yes\n==> Pouring git--2.47.bottle.tar.gz\n');
    await vi.advanceTimersByTimeAsync(PROMPT_IDLE_MS * 2);

    expect(warnings).toEqual([]);
  });

  it('Only warns about the prompt (no replay) when the output is already shown', async () => {
    VerbosityLevel.set(3);
    monitor.watch('ssh-key');
    output('Enter passphrase (empty for no passphrase): ');
    await vi.advanceTimersByTimeAsync(SLOW_RESOURCE_AFTER_MS);

    expect(warnings).toEqual(['ssh-key may be waiting for input, which Codify can\'t answer for it. Press Ctrl+C to stop.']);
    expect(shown).toEqual(['Enter passphrase (empty for no passphrase): ']);
  });

  it('Says when a slow resource has no output yet, and does not hide output in verbose mode', async () => {
    const onHide = vi.fn();
    const handle = monitor.watch('xcode-tools', { onHide });
    await vi.advanceTimersByTimeAsync(SLOW_RESOURCE_AFTER_MS);

    expect(warnings).toEqual(['xcode-tools is taking more than a minute. Showing its output (none so far).']);
    expect(shown).toEqual([]);

    output('Installing\n');
    expect(shown).toEqual(['Installing\n']);

    VerbosityLevel.set(3);
    await handle.finish();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('Detects prompts', () => {
    for (const line of ['Continue? [y/N]', 'Password:', 'Are you sure (yes/no/[fingerprint])?', 'Press RETURN/ENTER to continue or any other key to abort:', 'Overwrite (y/n)', 'Enter passphrase']) {
      expect(isPromptLike(line), line).toBe(true);
    }

    for (const line of ['==> Downloading https://ghcr.io/v2/homebrew/core/git', 'Installed 3 packages', '100.0%']) {
      expect(isPromptLike(line), line).toBe(false);
    }
  });
});
