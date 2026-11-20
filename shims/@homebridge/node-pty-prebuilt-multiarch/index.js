// Plugins built before the switch to node-pty `require('@homebridge/node-pty-prebuilt-multiarch')`.
// The CLI puts this folder on the plugins' NODE_PATH so that name resolves to the CLI's own node-pty
// (found next to this folder, in the package's node_modules) instead of shipping a second copy.
'use strict';
module.exports = require('node-pty');
