#!/bin/bash
set -euo pipefail

if [ -d "$HOME/.nvm" ]; then
  echo "FAIL: ~/.nvm still exists after destroy" >&2
  exit 1
fi

if [ -d "$HOME/.goenv" ] || command -v goenv >/dev/null 2>&1; then
  echo "FAIL: goenv still present after destroy" >&2
  exit 1
fi

echo "nvm and goenv confirmed removed."
