#!/bin/bash

APPLE_DEVELOPER_APPLICATION_PROFILE=$(cat package.json | jq -r '.oclif.macos."application-certificate"')

# node-pty ships its native binaries for every platform in prebuilds/<platform>-<arch>. Sign the copy installed under the
# @homebridge alias too, since plugins built before the node-pty switch load that one.
for dir in node_modules/node-pty/prebuilds/darwin-* node_modules/@homebridge/node-pty-prebuilt-multiarch/prebuilds/darwin-*; do
  codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" "$dir/spawn-helper" --force
  codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" "$dir/pty.node" --force
done
