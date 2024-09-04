import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import wasm from '@rollup/plugin-wasm';
import copy from 'rollup-plugin-copy';

export default {
  input: 'src/index.ts',
  output: {
    dir:'./build/dist',
    format: 'es'
  },
  plugins: [
    copy({
      targets: [{ dest: './dist/', src: './node_modules/yoga-wasm-web/dist/yoga.wasm' }]
    }),
    json(),
    wasm(),
    nodeResolve({ exportConditions: ['node'] }),
    typescript(),
    commonjs(),
    terser()
  ]
}
