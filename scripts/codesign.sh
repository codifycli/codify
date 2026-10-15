#!/bin/bash

APPLE_DEVELOPER_APPLICATION_PROFILE=$(cat package.json | jq -r '.oclif.macos."application-certificate"')

# @lydell/node-pty ships its native binaries in per-platform packages (e.g. @lydell/node-pty-darwin-arm64/prebuilds/darwin-arm64)
for dir in node_modules/@lydell/node-pty-darwin-*/prebuilds/darwin-*; do
  codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" "$dir/spawn-helper" --force
  codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" "$dir/pty.node" --force
done
