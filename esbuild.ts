import { build } from 'esbuild';
import { copy } from 'esbuild-plugin-copy';

await build({
  entryPoints: ['src/commands/**/index.ts', 'src/commands/*.ts', 'src/index.ts', 'bin/run.js'],
  bundle: true,
  minify: true,
  splitting: true,
  platform: 'node',
  outdir: 'dist',
  target: 'esnext',
  format: 'esm',
  // inject: ['cjs-shim.ts'],
  // external: ['react-devtools-core'],
  external: ['./node_modules/ink/build/devtools*'],
  // Hack for esbuild to supprot cjs requires. See https://github.com/evanw/esbuild/issues/1921
  banner: {
    js: `
import { fileURLToPath } from 'url';
import path from 'node:path';
const require = await import('module').then($=>$.createRequire(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`
  },
  plugins: [
    copy({
      assets: { from: ['./node_modules/yoga-wasm-web/dist/yoga.wasm'], to: ['yoga.wasm'] }
    })
  ]
});
