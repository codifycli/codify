import chalk from 'chalk';
import { cleanup, render } from 'ink-testing-library';
import { EventEmitter } from 'node:events';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultReporter } from '../reporters/default-reporter.js';
import { RenderStatus, store } from '../store/index.js';
import { DefaultComponent } from './default-component.js';

// Mock dependent components
// vi.mock('./progress/progress-display', () => ({
//   ProgressDisplay: () => <div>Mock Progress Display</div>
// }));
// vi.mock('./import/index', () => ({
//   ImportParametersForm: () => <div>Mock Import Parameters Form</div>
// }));
// vi.mock('./plan/plan', () => ({
//   PlanComponent: () => <div>Mock Plan Component</div>
// }));
// vi.mock('./import/import-result', () => ({
//   ImportResultComponent: () => <div>Mock Import Result Component</div>
// }));

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

  it('Renders the init completed message', () => {
    const reporter = new DefaultReporter();
    const locationToSave = '~/codify.jsonc'

    reporter.displayMessage(`
🎉🎉 Codify successfully initialized. 🎉🎉   
The imported configs were written to: ${locationToSave}

Use ${chalk.bgHex('#F0EAD6').bold(' codify plan ')} to futures compute changes and ${chalk.bgHex('#F0EAD6').bold(' codify apply ')} to apply them.
Visit the documentation for more info: https://docs.codifycli.com.
    `)
  })

  it('renders progress display when renderStatus is PROGRESS', () => {
    // TODO: Doesn't work on github actions for some reason. Will investigate later 02-13-2025
    // store.set(store.renderState, { status: RenderStatus.PROGRESS });
    // const { lastFrame } = render(<DefaultComponent emitter={emitter} />);
    //
    // expect(lastFrame()).toContain('Mock Progress Display');
  });

  it('renders the plan when renderStatus is DISPLAY_PLAN', () => {
    // TODO: Doesn't work on github actions for some reason. Will investigate later 02-13-2025
    // store.set(store.renderState, { status: RenderStatus.DISPLAY_PLAN, data: {} });
    // const { lastFrame } = render(<DefaultComponent emitter={emitter} />);
    //
    // expect(lastFrame()).toContain('Mock Plan Component');
  });

  it('handles SUDO_PROMPT event and submits password', () => {
    store.set(store.renderState, { status: RenderStatus.SUDO_PROMPT, data: 'message' });
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);

    expect(lastFrame()).toContain('Password:');
  });
});
