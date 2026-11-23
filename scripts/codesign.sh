#!/bin/bash
set -e

APPLE_DEVELOPER_APPLICATION_PROFILE=$(cat package.json | jq -r '.oclif.macos."application-certificate"')

# node-pty ships its native binaries for every platform in prebuilds/<platform>-<arch>. Plugins built before the
# node-pty switch load it through the @homebridge shim in shims/ (plain JS), so this is the only copy to sign.
shopt -s nullglob
dirs=(node_modules/node-pty/prebuilds/darwin-*)
if [ ${#dirs[@]} -eq 0 ]; then
  echo "codesign.sh: no node-pty darwin prebuilds found in $(pwd)/node_modules" >&2
  exit 1
fi

for dir in "${dirs[@]}"; do
  codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" "$dir/spawn-helper" --force
  codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" "$dir/pty.node" --force
done
