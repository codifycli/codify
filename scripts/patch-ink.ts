// Patches ink to add suspendStdin/resumeStdin to the render() return value.
//
// Why: when Codify needs to hand a raw PTY session to the user (e.g. `gh auth login`),
// Ink's internal 'readable' listener on process.stdin must be fully removed and the
// libuv fd watcher released before our stdinListener can receive data events. Simply
// removing the listener isn't enough — the stream stays in pull-mode and libuv stops
// polling fd 0. The only clean fix is to let Ink tear down stdin via its own internal
// handleSetRawMode(false) path (which calls stdin.unref()), then re-add it afterward.
//
// Targets ink 6.x. Every patch looks up exact source snippets and exits with an error if they are missing, so a
// future ink upgrade fails loudly here instead of silently breaking the PTY handoff.
//
// What the patch adds:
//   App.js    — registers suspend/resume closures on a `codifyStdinControl` prop. suspend fully releases stdin
//               (raw mode off, readable listener removed, unref); resume restores it.
//   ink.js    — passes `codifyStdinControl` to App and exposes suspendStdin()/resumeStdin() plus
//               pauseRendering()/resumeRendering() for stopping the render loop during the handoff.
//   render.js — includes suspendStdin/resumeStdin in the return value of render().
//   reconciler.js — clears the cached <Static> node when it's unmounted (see the reconciler section below).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Locate ink's install dir via Node module resolution rather than a fixed
// relative path. Under an npm install, ink is hoisted to the top-level
// node_modules (not nested under codify), so `../node_modules/ink` misses it and
// the patch silently skips. Resolve ink's entry point (ink/package.json can't be
// resolved directly — ink's "exports" map doesn't expose it) and walk up to the
// package root, which finds ink wherever npm/pnpm placed it (hoisted, nested, or
// symlinked). Falls back to the old relative path (used by the self-contained
// binary build) if resolution somehow fails.
function resolveInkDir(): string {
  try {
    const require = createRequire(import.meta.url);
    let dir = path.dirname(require.resolve('ink')); // .../ink/build/index.js → .../ink/build
    while (dir !== path.dirname(dir)) {
      if (existsSync(path.join(dir, 'package.json'))) return path.join(dir, 'build');
      dir = path.dirname(dir);
    }
  } catch {
    // fall through to the relative-path default below
  }

  return path.join(__dirname, '../node_modules/ink/build');
}

const INK_DIR = resolveInkDir();
const APP_JS = path.join(INK_DIR, 'components/App.js');
const INK_JS = path.join(INK_DIR, 'ink.js');
const RENDER_JS = path.join(INK_DIR, 'render.js');
const RECONCILER_JS = path.join(INK_DIR, 'reconciler.js');

if (!existsSync(APP_JS)) {
  console.log('ink App.js not found. Skipping.');
  process.exit(0);
}

// ── Patch App.js ─────────────────────────────────────────────────────────────
// Since ink 6, App is a function component, so there is no class instance to call methods on. Instead, ink.js
// (patched below) passes a mutable `codifyStdinControl` object as a prop, and App assigns suspend/resume closures
// onto it on every render. The closures reuse App's own refs, so they always see the current listener state.
let appContent = await fs.readFile(APP_JS, 'utf8');

if (!appContent.includes('CODIFY_INK_PATCH')) {
  const SIGNATURE_SEARCH = 'setCursorPosition, }) {';
  const SNAPSHOT_SEARCH = 'stdin.addListener(\'readable\', handleReadable);';
  const INSERT_SEARCH = '// Focus navigation helpers';
  if (
    !appContent.includes(SIGNATURE_SEARCH)
    || !appContent.includes(SNAPSHOT_SEARCH)
    || !appContent.includes(INSERT_SEARCH)
  ) {
    console.error('ERROR: Could not find insertion points in ink App.js.');
    process.exit(1);
  }

  // Accept the control object as a prop
  appContent = appContent.replace(SIGNATURE_SEARCH, 'setCursorPosition, codifyStdinControl, }) {');

  // Snapshot stdin's internal kState bits right before ink adds its 'readable' listener (see suspend below)
  appContent = appContent.replace(SNAPSHOT_SEARCH, `if (codifyStdinControl) {
                    const _ks = Object.getOwnPropertySymbols(stdin._readableState)[0];
                    if (_ks !== undefined) { codifyStdinControl.kStateBeforeReadable = stdin._readableState[_ks]; }
                }
                ${SNAPSHOT_SEARCH}`);

  const PATCH = `// CODIFY_INK_PATCH — suspendStdin/resumeStdin
    if (codifyStdinControl) {
        codifyStdinControl.suspend = () => {
            if (!isRawModeSupported || rawModeEnabledCount.current === 0) {
                return;
            }
            stdin.setRawMode(false);
            detachReadableListener();
            stdin.unref();
            inputParserRef.current.reset();
            clearPendingInputFlush();
            // In Node 24, removeListener does not clear internal kState bits set by
            // addListener('readable'), so isPaused() stays true and resume() won't
            // switch to flowing mode. Restore the kState value from before Ink added
            // its readable listener to fully undo the listener registration.
            const kState = Object.getOwnPropertySymbols(stdin._readableState)[0];
            if (kState !== undefined && codifyStdinControl.kStateBeforeReadable !== undefined) {
                stdin._readableState[kState] = codifyStdinControl.kStateBeforeReadable;
            }
        };
        codifyStdinControl.resume = () => {
            if (!isRawModeSupported || rawModeEnabledCount.current === 0) {
                return;
            }
            stdin.ref();
            stdin.setRawMode(true);
            stdin.setEncoding('utf8');
            readableListenerRef.current = handleReadable;
            stdin.addListener('readable', handleReadable);
        };
    }
    `;

  appContent = appContent.replace(INSERT_SEARCH, PATCH + INSERT_SEARCH);
  await fs.writeFile(APP_JS, appContent, 'utf8');
  console.log('Patched ink App.js');
} else {
  console.log('ink App.js already patched. Skipping.');
}

// ── Patch ink.js ─────────────────────────────────────────────────────────────
let inkContent = await fs.readFile(INK_JS, 'utf8');

if (!inkContent.includes('CODIFY_INK_PATCH')) {
  const METHODS_SEARCH = 'async waitUntilExit() {';
  const APP_PROPS_SEARCH = 'onExit: this.handleAppExit }';
  if (!inkContent.includes(METHODS_SEARCH) || !inkContent.includes(APP_PROPS_SEARCH)) {
    console.error('ERROR: Could not find insertion points in ink ink.js.');
    process.exit(1);
  }

  // Hand App the control object it registers suspend/resume on
  inkContent = inkContent.replace(
    APP_PROPS_SEARCH,
    'onExit: this.handleAppExit, codifyStdinControl: this.codifyStdinControl }'
  );

  const PATCH = `// CODIFY_INK_PATCH — stdin + render loop handoff
    codifyStdinControl = {};
    suspendStdin() {
        this.codifyStdinControl.suspend?.();
    }
    resumeStdin() {
        this.codifyStdinControl.resume?.();
    }
    pauseRendering() {
        // Temporarily stop all stdout writes without tearing down the React tree.
        // Cancel pending throttled writes so nothing lands on the terminal after the pause.
        this.throttledOnRender?.cancel?.();
        this.throttledLog?.cancel?.();
        this.isUnmounted = true;
        this.log.clear();
    }
    resumeRendering() {
        this.isUnmounted = false;
        // The log was cleared on pause, so force the next frame to be written even if it is unchanged.
        this.lastOutput = '';
        this.onRender();
    }
    `;

  inkContent = inkContent.replace(METHODS_SEARCH, PATCH + METHODS_SEARCH);
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

// ── Patch reconciler.js ──────────────────────────────────────────────────────
// Backport of ink 8.0.0's clearStaticNodeIfContained.
//
// Why: ink caches the mounted <Static> on rootNode.staticNode and never clears it. When the <Static> (or any
// ancestor of it) is unmounted, its yoga node is freed but the renderer keeps reading it every frame. Once new
// yoga nodes reuse that WASM memory, yoga crashes with "RuntimeError: memory access out of bounds".
let reconcilerContent = await fs.readFile(RECONCILER_JS, 'utf8');

if (!reconcilerContent.includes('CODIFY_INK_PATCH')) {
  const HELPER_SEARCH = 'export default createReconciler({';
  const REMOVE_SEARCH = 'removeChildNode(node, removeNode);';
  const helperIdx = reconcilerContent.indexOf(HELPER_SEARCH);
  if (helperIdx === -1 || !reconcilerContent.includes(REMOVE_SEARCH)) {
    console.error('ERROR: Could not find insertion point in ink reconciler.js.');
    process.exit(1);
  }

  const HELPER_PATCH = `// CODIFY_INK_PATCH — clear stale staticNode on removal
const codifyClearStaticNode = (parentNode, removedNode) => {
    let rootNode = parentNode;
    while (rootNode?.parentNode) {
        rootNode = rootNode.parentNode;
    }
    // Walk up from staticNode to see if the removed node is it or one of its ancestors. On key-driven remounts the
    // new <Static> is already registered, so it won't be inside the removed subtree and is left alone.
    let current = rootNode?.staticNode;
    while (current) {
        if (current === removedNode) {
            rootNode.staticNode = undefined;
            return;
        }
        current = current.parentNode;
    }
};
`;

  // Clear before removeChildNode, which detaches the removed node from its parent
  reconcilerContent = reconcilerContent.slice(0, helperIdx) + HELPER_PATCH + reconcilerContent.slice(helperIdx);
  reconcilerContent = reconcilerContent.replaceAll(
    REMOVE_SEARCH,
    `codifyClearStaticNode(node, removeNode);\n        ${REMOVE_SEARCH}`
  );
  await fs.writeFile(RECONCILER_JS, reconcilerContent, 'utf8');
  console.log('Patched ink reconciler.js');
} else {
  console.log('ink reconciler.js already patched. Skipping.');
}
