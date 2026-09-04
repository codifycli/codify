#!/bin/bash
set -x

brew uninstall --ignore-dependencies $(brew list | grep -E '^node(@|$)') 2>/dev/null || true
brew uninstall --ignore-dependencies $(brew list | grep -E '^go$') 2>/dev/null || true

hash -r
command -v node && exit 1
command -v go && exit 1
echo "node/go removed."
