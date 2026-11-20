// The packages that stay in node_modules when the CLI is bundled (esbuild.ts). Everything else is bundled into
// dist/, so the packaged CLI only installs these (scripts/pkg.ts rewrites the dependencies of .build/package.json).
//
// - @oclif/*: oclif finds the commands, hooks and plugins through files on disk (package.json, oclif.manifest.json)
// - node-pty: a native addon. Plugins also load it from the CLI's node_modules (NODE_PATH, see plugin-process.ts)
export const RUNTIME_DEPENDENCIES = [
  '@oclif/core',
  '@oclif/plugin-autocomplete',
  '@oclif/plugin-help',
  'node-pty',
];

// Optional imports of bundled packages that are not installed. They are only loaded when available (in a try/catch
// or behind a flag), so they are left as imports that fail at runtime instead of failing the build.
// - react-devtools-core: ink, only when DEV=true
// - bufferutil, utf-8-validate: optional speedups of ws
export const OPTIONAL_IMPORTS = [
  'bufferutil',
  'react-devtools-core',
  'utf-8-validate',
];
