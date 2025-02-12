import { cleanup, render } from 'ink-testing-library';
import { EventEmitter } from 'node:events';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RenderStatus, store } from '../store/index.js';
import { DefaultComponent } from './default-component.js';

// Mock dependent components
vi.mock('./progress/progress-display', () => ({
  ProgressDisplay: () => <div>Mock Progress Display</div>
}));
vi.mock('./import/index', () => ({
  ImportParametersForm: () => <div>Mock Import Parameters Form</div>
}));
vi.mock('./plan/plan', () => ({
  PlanComponent: () => <div>Mock Plan Component</div>
}));
vi.mock('./import/import-result', () => ({
  ImportResultComponent: () => <div>Mock Import Result Component</div>
}));

describe('DefaultComponent', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    emitter.removeAllListeners();
  });

  it('renders progress display when renderStatus is PROGRESS', () => {
    store.set(store.renderState, { status: RenderStatus.PROGRESS });
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);

    expect(lastFrame()).toContain('Mock Progress Display');
  });

  it('renders the plan when renderStatus is DISPLAY_PLAN', () => {
    store.set(store.renderState, { status: RenderStatus.DISPLAY_PLAN, data: {} });
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);

    expect(lastFrame()).toContain('Mock Plan Component');
  });

  it('handles SUDO_PROMPT event and submits password', () => {
    store.set(store.renderState, { status: RenderStatus.SUDO_PROMPT, data: 'message' });
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);

    expect(lastFrame()).toContain('Password:');
  });
});
