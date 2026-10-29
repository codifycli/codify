#!/bin/bash
# Runs via the `pretarball` npm script inside oclif's packing workspace (.build/tmp/codify), after oclif has installed
# production dependencies there and before it builds each target. Changes to node_modules must happen here: oclif
# re-installs dependencies into this workspace, so edits to .build/node_modules never reach the tarballs.
set -e

# node-pty bundles prebuilt binaries for every platform. The Windows ones are ~23MB per copy and no tarball targets Windows.
rm -rf node_modules/node-pty/prebuilds/win32-* node_modules/@homebridge/node-pty-prebuilt-multiarch/prebuilds/win32-*

"$(dirname "$0")/codesign.sh"
