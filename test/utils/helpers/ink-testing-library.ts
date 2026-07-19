import { EventEmitter } from 'node:events';
import { render as inkRender } from 'ink';
import type { ReactElement } from 'react';

// Vendored replacement for `ink-testing-library` (unmaintained beyond 4.0.0,
// incompatible with ink 5's App.js which reads `stdin._readableState`'s
// internal symbol key when enabling raw mode). Keeps the same public API.

class Stdout extends EventEmitter {
  get columns() {
    return 100;
  }

  frames: string[] = [];
  private _lastFrame?: string;

  write = (frame: string) => {
    this.frames.push(frame);
    this._lastFrame = frame;
  };

  lastFrame = () => this._lastFrame;
}

class Stderr extends EventEmitter {
  frames: string[] = [];
  private _lastFrame?: string;

  write = (frame: string) => {
    this.frames.push(frame);
    this._lastFrame = frame;
  };

  lastFrame = () => this._lastFrame;
}

// ink's App.js (patched, see App.js `CODIFY_INK_PATCH`) does
// `Object.getOwnPropertySymbols(stdin._readableState)[0]` when enabling raw
// mode. A real Node `Readable` always has a `_readableState` object with a
// `kState` symbol; the upstream ink-testing-library fake extends bare
// `EventEmitter` and has no such property, so that call throws
// "Cannot convert undefined or null to object" as soon as any component
// using `useInput` mounts. We stub just enough of that shape here.
const kState = Symbol('kState');

class Stdin extends EventEmitter {
  isTTY = true;
  data: string | null = null;
  _readableState: Record<symbol, number> = { [kState]: 0 };

  constructor(options: { isTTY?: boolean } = {}) {
    super();
    this.isTTY = options.isTTY ?? true;
  }

  write = (data: string) => {
    this.data = data;
    this.emit('readable');
    this.emit('data', data);
  };

  setEncoding() {
    // Do nothing
  }

  setRawMode() {
    // Do nothing
  }

  resume() {
    // Do nothing
  }

  pause() {
    // Do nothing
  }

  ref() {
    // Do nothing
  }

  unref() {
    // Do nothing
  }

  read = (): string | null => {
    const { data } = this;
    this.data = null;
    return data;
  };
}

type Instance = {
  rerender: (tree: ReactElement) => void;
  unmount: () => void;
  cleanup: () => void;
  stdout: Stdout;
  stderr: Stderr;
  stdin: Stdin;
  frames: string[];
  lastFrame: () => string | undefined;
};

const instances: ReturnType<typeof inkRender>[] = [];

export const render = (tree: ReactElement): Instance => {
  const stdout = new Stdout();
  const stderr = new Stderr();
  const stdin = new Stdin();

  const instance = inkRender(tree, {
    stdout: stdout as any,
    stderr: stderr as any,
    stdin: stdin as any,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  instances.push(instance);

  return {
    rerender: instance.rerender,
    unmount: instance.unmount,
    cleanup: instance.cleanup,
    stdout,
    stderr,
    stdin,
    frames: stdout.frames,
    lastFrame: stdout.lastFrame,
  };
};

export const cleanup = () => {
  for (const instance of instances) {
    instance.unmount();
    instance.cleanup();
  }
  instances.length = 0;
};
