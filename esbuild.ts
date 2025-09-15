import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/handlers/**/router.ts', 'src/handlers/*.ts', 'src/router.ts'],
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
