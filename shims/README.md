Packages that plugins can `require()` through `NODE_PATH` (set in `src/plugins/plugin-process.ts`).

- `@homebridge/node-pty-prebuilt-multiarch`: re-exports `node-pty` for plugins built before the CLI
  switched to `node-pty`. It used to be an npm alias, which installed a second 26 MB copy of node-pty.
