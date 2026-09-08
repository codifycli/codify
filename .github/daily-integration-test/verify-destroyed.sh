#!/bin/bash
set -uo pipefail

fail=0

if [ -d "$HOME/.nvm" ]; then
  echo "FAIL: ~/.nvm still exists after destroy" >&2
  ls -la "$HOME/.nvm" >&2
  fail=1
fi

# Check for goenv itself, not for $GOENV_ROOT as a whole. On the macOS runner the Go module
# cache lives at $GOENV_ROOT/shared/go-mod and is repopulated by Go tooling after the destroy,
# so the bare directory existing says nothing about whether goenv is still installed.
for leftover in "$HOME/.goenv/bin" "$HOME/.goenv/shims" "$HOME/.goenv/versions"; do
  if [ -d "$leftover" ]; then
    echo "FAIL: $leftover still exists after destroy" >&2
    ls -la "$leftover" >&2
    fail=1
  fi
done

if command -v goenv >/dev/null 2>&1; then
  echo "FAIL: 'goenv' is still resolvable after destroy" >&2
  echo "  command -v goenv -> $(command -v goenv)" >&2
  echo "  type goenv       -> $(type goenv 2>&1 | head -3)" >&2
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
