#!/bin/bash
set -e;

if [[ $(/usr/bin/id -u) -ne 0 ]]; then
    echo "Not running as root"
    exit
fi

BIN_LOCATION=$(which codify) || { echo "Codify not found! Nothing to uninstall"; exit 0; }
LIB_LOCATION=$(dirname "$(readlink -f $BIN_LOCATION)")

echo "Removing $BIN_LOCATION"
rm -f $BIN_LOCATION

echo "Removing $(realpath $LIB_LOCATION/..)"
rm -rf "$(realpath "$LIB_LOCATION"/..)"

echo "Removing \$HOME/.codify"
rm -rf "$HOME/.codify"

echo "Removing \$HOME/.local/share/codify/"
rm -rf $HOME/.local/share/codify/

echo "Done uninstalling codify. We're sorry to see you go."
