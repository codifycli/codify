// Patches ink to add suspendStdin/resumeStdin to the render() return value.
//
// Why: when Codify needs to hand a raw PTY session to the user (e.g. `gh auth login`),
// Ink's internal 'readable' listener on process.stdin must be fully removed and the
// libuv fd watcher released before our stdinListener can receive data events. Simply
// removing the listener isn't enough — the stream stays in pull-mode and libuv stops
// polling fd 0. The only clean fix is to let Ink tear down stdin via its own internal
// handleSetRawMode(false) path (which calls stdin.unref()), then re-add it afterward.
//
// What the patch adds:
//   App.js    — suspendStdin() calls handleSetRawMode(false) to fully release stdin;
//               resumeStdin()  calls handleSetRawMode(true)  to restore it.
//   ink.js    — suspendStdin()/resumeStdin() methods that delegate to the App instance.
//   render.js — includes suspendStdin/resumeStdin in the return value of render().

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INK_DIR = path.join(__dirname, '../node_modules/ink/build');
const APP_JS = path.join(INK_DIR, 'components/App.js');
const INK_JS = path.join(INK_DIR, 'ink.js');
const RENDER_JS = path.join(INK_DIR, 'render.js');

if (!existsSync(APP_JS)) {
  console.log('ink App.js not found. Skipping.');
  process.exit(0);
}

// ── Patch App.js ─────────────────────────────────────────────────────────────
let appContent = await fs.readFile(APP_JS, 'utf8');

if (!appContent.includes('CODIFY_INK_PATCH')) {
  // Remove any orphaned fragments from previous partial patch attempts
  appContent = appContent.replace(/\n            stdin\.setRawMode\(false\);\n            stdin\.removeListener\('readable', this\.handleReadable\);\n            stdin\.unref\(\);\n        \}\n    \};\n    resumeStdin[\s\S]*?\};\n(?=    \/\/ CODIFY_INK_PATCH)/, '\n');

  // Also patch handleSetRawMode to snapshot kState before addListener('readable')
  const SNAPSHOT_SEARCH = 'stdin.addListener(\'readable\', this.handleReadable);';
  const snapshotIdx = appContent.indexOf(SNAPSHOT_SEARCH);
  if (snapshotIdx !== -1) {
    const SNAPSHOT_PATCH = `const _ks = Object.getOwnPropertySymbols(stdin._readableState)[0];
                if (_ks !== undefined) { this._kStateBeforeReadable = stdin._readableState[_ks]; }
                `;
    appContent = appContent.slice(0, snapshotIdx) + SNAPSHOT_PATCH + appContent.slice(snapshotIdx);
  }

  // Insert suspendStdin/resumeStdin just before the closing brace of the class
  const SEARCH = 'findPreviousFocusable = (state) => {';
  const idx = appContent.indexOf(SEARCH);
  if (idx === -1) {
    console.error('ERROR: Could not find insertion point in ink App.js.');
    process.exit(1);
  }

  const PATCH = `// CODIFY_INK_PATCH — suspendStdin/resumeStdin
    _kStateBeforeReadable = undefined;
    suspendStdin = () => {
        if (this.isRawModeSupported() && this.rawModeEnabledCount > 0) {
            const { stdin } = this.props;
            stdin.setRawMode(false);
            stdin.removeListener('readable', this.handleReadable);
            stdin.unref();
            // In Node 24, removeListener does not clear internal kState bits set by
            // addListener('readable'), so isPaused() stays true and resume() won't
            // switch to flowing mode. Restore the kState value from before Ink added
            // its readable listener to fully undo the listener registration.
            const kState = Object.getOwnPropertySymbols(stdin._readableState)[0];
            if (kState !== undefined && this._kStateBeforeReadable !== undefined) {
                stdin._readableState[kState] = this._kStateBeforeReadable;
            }
        }
    };
    resumeStdin = () => {
        if (this.isRawModeSupported() && this.rawModeEnabledCount > 0) {
            const { stdin } = this.props;
            stdin.ref();
            stdin.setRawMode(true);
            stdin.setEncoding('utf8');
            stdin.addListener('readable', this.handleReadable);
        }
    };
    `;

  appContent = appContent.slice(0, idx) + PATCH + appContent.slice(idx);
  await fs.writeFile(APP_JS, appContent, 'utf8');
  console.log('Patched ink App.js');
} else {
  console.log('ink App.js already patched. Skipping.');
}

// ── Patch ink.js ─────────────────────────────────────────────────────────────
let inkContent = await fs.readFile(INK_JS, 'utf8');

if (!inkContent.includes('suspendStdin')) {
  // Add suspendStdin/resumeStdin methods that reach into the React tree via the
  // container's current fiber to call the App component's methods.
  // Simpler approach: store the App ref. But since we don't have a ref, we access
  // the fiber's stateNode. Add methods to the Ink class that call into the container.
  const SEARCH = 'async waitUntilExit() {';
  const idx = inkContent.indexOf(SEARCH);
  if (idx === -1) {
    console.error('ERROR: Could not find insertion point in ink ink.js.');
    process.exit(1);
  }

  const PATCH = `suspendStdin() {
        // Walk the fiber tree to find the App component instance and call suspendStdin
        let fiber = this.container.current;
        while (fiber) {
            if (fiber.stateNode && typeof fiber.stateNode.suspendStdin === 'function') {
                fiber.stateNode.suspendStdin();
                return;
            }
            fiber = fiber.child;
        }
    }
    resumeStdin() {
        let fiber = this.container.current;
        while (fiber) {
            if (fiber.stateNode && typeof fiber.stateNode.resumeStdin === 'function') {
                fiber.stateNode.resumeStdin();
                return;
            }
            fiber = fiber.child;
        }
    }
    pauseRendering() {
        // Temporarily stop all stdout writes without tearing down the React tree.
        this.isUnmounted = true;
        this.log.clear();
    }
    resumeRendering() {
        this.isUnmounted = false;
        this.onRender();
    }
    `;

  inkContent = inkContent.slice(0, idx) + PATCH + inkContent.slice(idx);
  await fs.writeFile(INK_JS, inkContent, 'utf8');
  console.log('Patched ink ink.js');
} else {
  console.log('ink ink.js already patched. Skipping.');
}

// ── Patch render.js ───────────────────────────────────────────────────────────
let renderContent = await fs.readFile(RENDER_JS, 'utf8');

if (!renderContent.includes('suspendStdin')) {
  const SEARCH = 'clear: instance.clear,';
  const idx = renderContent.indexOf(SEARCH);
  if (idx === -1) {
    console.error('ERROR: Could not find insertion point in ink render.js.');
    process.exit(1);
  }

  const PATCH = `clear: instance.clear,
        suspendStdin: instance.suspendStdin.bind(instance),
        resumeStdin: instance.resumeStdin.bind(instance),
        pauseRendering: instance.pauseRendering.bind(instance),
        resumeRendering: instance.resumeRendering.bind(instance),`;

  renderContent = renderContent.slice(0, idx) + PATCH + renderContent.slice(idx + SEARCH.length);
  await fs.writeFile(RENDER_JS, renderContent, 'utf8');
  console.log('Patched ink render.js');
} else {
  console.log('ink render.js already patched. Skipping.');
}
