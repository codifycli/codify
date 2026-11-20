import { build } from 'esbuild';
import { globSync } from 'node:fs';

import { OPTIONAL_IMPORTS, RUNTIME_DEPENDENCIES } from './scripts/bundle-config.js';

const result = await build({
  // oclif loads these files by path: dist/commands/<command>.js, dist/hooks/<hook>.js, dist/help.js and dist/index.js
  entryPoints: [
    ...globSync(['src/commands/*.ts', 'src/hooks/*.ts']).filter((file) => !file.endsWith('.test.ts')),
    'src/index.ts',
    'src/help.ts',
  ],
  bundle: true,
  minify: true,
  splitting: true,
  platform: 'node',
  target: 'node22',
  outdir: '.build/dist',
  outbase: 'src',
  format: 'esm',
  // Every dependency is bundled, except the ones that must stay in node_modules
  external: [...RUNTIME_DEPENDENCIES, ...OPTIONAL_IMPORTS],
  // The bundled CommonJS packages call require() for node builtins, which ES modules don't have
  banner: {
    js: "import { createRequire as __codifyCreateRequire } from 'node:module'; const require = __codifyCreateRequire(import.meta.url);",
  },
  metafile: true,
  logLevel: 'info',
});

const outputs = Object.entries(result.metafile.outputs);
const totalBytes = outputs.reduce((sum, [, output]) => sum + output.bytes, 0);
console.log(`Bundled ${Object.keys(result.metafile.inputs).length} files into ${outputs.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
