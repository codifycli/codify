#!/bin/bash
# Runs via the `pretarball` npm script inside oclif's packing workspace (.build/tmp/codify), after oclif has installed
# production dependencies there and before it builds each target. Changes to node_modules must happen here: oclif
# re-installs dependencies into this workspace, so edits to .build/node_modules never reach the tarballs.
set -e

# node-pty bundles prebuilt binaries for every platform. No tarball targets Windows, so remove the Windows prebuilds
# (~23MB) and the ConPTY binaries it ships for Windows (~2MB).
rm -rf node_modules/node-pty/prebuilds/win32-* node_modules/node-pty/third_party/conpty

"$(dirname "$0")/codesign.sh"
