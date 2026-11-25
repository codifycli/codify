import { useSyncExternalStore } from 'react';

import { ProgressState } from '../components/progress/progress-display.js';

export interface RenderState {
  status: RenderStatus | null;
  data?: unknown;
}

export enum RenderStatus {
  NOTHING,
  PROGRESS,
  DISPLAY_INIT_BANNER,
  DISPLAY_PLAN,
  DISPLAY_IMPORT_RESULT,
  DISPLAY_FILE_MODIFICATION,
  PROMPT_INIT_RESULT_SELECTION,
  IMPORT_PROMPT_WARNING,
  PROMPT_PARAMETER_LIST,
  PROMPT_CONFIRMATION,
  PROMPT_OPTIONS,
  PROMPT_INPUT,
  PROMPT_PRESS_KEY_TO_CONTINUE,
  PROMPT_VARIABLE,
  PROMPT_VARIABLE_FORM,
  SUDO_PROMPT,
  DISPLAY_MESSAGE,
  PLUGIN_ERROR,
  APPLY_COMPLETE,
  DISPLAY_NOTICES,
}

/** A value the UI can subscribe to (replaces jotai atoms). Listeners are only called when the value changes. */
export class Atom<Value> {
  private listeners = new Set<() => void>();

  constructor(private value: Value) {}

  get = (): Value => this.value;

  set(value: Value): void {
    if (Object.is(value, this.value)) {
      return;
    }

    this.value = value;
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/** Re-renders the component when the atom changes. */
export function useAtomValue<Value>(atom: Atom<Value>): Value {
  return useSyncExternalStore(atom.subscribe, atom.get, atom.get);
}

export const store = new class {
  renderState = new Atom<RenderState>({ status: RenderStatus.PROGRESS })
  progressState = new Atom<ProgressState | null>(null)
  isSudoPasswordCached = new Atom(false)
  isSleepPrevented = new Atom(false)

  get<Value>(atom: Atom<Value>): Value {
    return atom.get();
  }

  set<Value>(atom: Atom<Value>, value: Value): void {
    atom.set(value);
  }
}
