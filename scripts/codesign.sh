#!/bin/bash

APPLE_DEVELOPER_APPLICATION_PROFILE=$(cat package.json | jq -r '.oclif.macos."application-certificate"')

codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" node_modules/@homebridge/node-pty-prebuilt-multiarch/build/Release/spawn-helper --force
codesign --verbose=4 --timestamp --strict --options runtime -s "$APPLE_DEVELOPER_APPLICATION_PROFILE" node_modules/@homebridge/node-pty-prebuilt-multiarch/build/Release/pty.node --force
