import { atom, createStore, getDefaultStore, Setter, Getter, Atom, WritableAtom } from 'jotai'

import { ProgressState } from '../components/progress/progress-display.js';

export interface RenderState {
  status: RenderStatus | null;
  data?: unknown;
}

export enum RenderStatus {
  PROGRESS,
  DISPLAY_PLAN,
  DISPLAY_IMPORT_RESULT,
  IMPORT_PROMPT,
  PROMPT_CONFIRMATION,
  APPLY_COMPLETE,
  SUDO_PROMPT,
}

export const store = new class {
  private internal = getDefaultStore()

  renderState = atom(<RenderState>{ status: RenderStatus.PROGRESS })
  renderStatus = atom((get) => get(this.renderState).status)
  renderData = atom((get) => get(this.renderState).data)

  progressState = atom(null as ProgressState | null)

  get<Value>(atom: Atom<Value>): Value {
    return this.internal.get(atom);
  }

  set<Value, Args extends unknown[], Result>(atom: WritableAtom<Value, Args, Result>, ...args: Args): Result {
    return this.internal.set(atom, ...args);
  }
}
