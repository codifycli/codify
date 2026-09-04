#!/bin/bash
set -x

sudo apt-get purge -y nodejs npm golang-go 2>&1 | tail -20 || true
sudo apt-get autoremove -y 2>&1 | tail -20 || true

# Catch anything left on PATH that wasn't apt-managed (hostedtoolcache symlinks, /usr/local, etc.)
for bin in node npm go; do
  path="$(command -v "$bin" || true)"
  [ -n "$path" ] && sudo rm -f "$path"
done
sudo rm -rf /usr/local/go /opt/hostedtoolcache/node /opt/hostedtoolcache/go

hash -r
command -v node && exit 1
command -v go && exit 1
echo "node/go removed."
