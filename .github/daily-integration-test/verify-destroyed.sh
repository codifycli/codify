#!/bin/bash
set -uo pipefail

fail=0

if [ -d "$HOME/.nvm" ]; then
  echo "FAIL: ~/.nvm still exists after destroy" >&2
  ls -la "$HOME/.nvm" >&2
  fail=1
fi

if [ -d "$HOME/.goenv" ]; then
  echo "FAIL: ~/.goenv directory still exists after destroy" >&2
  ls -laR "$HOME/.goenv" >&2
  fail=1
fi

if command -v goenv >/dev/null 2>&1; then
  echo "FAIL: 'goenv' is still resolvable after destroy" >&2
  echo "  command -v goenv -> $(command -v goenv)" >&2
  echo "  type goenv       -> $(type goenv 2>&1 | head -3)" >&2
  echo "  PATH             -> $PATH" >&2
  IFS=: read -ra _dirs <<< "$PATH"
  for _d in "${_dirs[@]}"; do
    [ -e "$_d/goenv" ] && echo "  on PATH: $_d/goenv" >&2
  done
  if command -v brew >/dev/null 2>&1; then
    brew list --formula 2>/dev/null | grep -x goenv >/dev/null \
      && echo "  brew still lists the goenv formula" >&2
  fi
  fail=1
fi

[ "$fail" -ne 0 ] && exit 1

echo "nvm and goenv confirmed removed."
