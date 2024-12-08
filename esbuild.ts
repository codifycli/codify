import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/commands/**/index.ts', 'src/commands/*.ts', 'src/index.ts'],
  bundle: true,
  minify: true,
  splitting: true,
  platform: 'node',
  outdir: '.build/dist',
  format: 'esm',
  packages: 'external',
  logLevel: 'debug',
});

console.log(result);
