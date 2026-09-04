#!/bin/bash
set -euo pipefail

if command -v brew >/dev/null 2>&1; then
  brew list jq
  jq --version
fi

if command -v apt-get >/dev/null 2>&1; then
  dpkg -l jq
  jq --version
fi

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
[ "$(nvm current)" = "v20.11.1" ]
node -v | grep -q "v20.11.1"

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
pyenv doctor
[ "$(pyenv version-name)" = "3.11.9" ]
python --version | grep -q "3.11.9"

export GOENV_ROOT="$HOME/.goenv"
export PATH="$GOENV_ROOT/bin:$GOENV_ROOT/shims:$PATH"
eval "$(goenv init -)" 2>/dev/null || true   # macOS installs goenv via brew; init still needed
[ "$(goenv version-name)" = "1.22.5" ]
go version | grep -q "go1.22.5"

echo "All resources verified."
