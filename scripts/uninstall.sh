#!/bin/bash
set -e;

if [[ $(/usr/bin/id -u) -ne 0 ]]; then
    echo "Not running as root"
    exit
fi

BIN_LOCATION=$(which codify)
LIB_LOCATION=$(dirname "$(readlink -f $BIN_LOCATION)")

sudo bash "$LIB_LOCATION/uninstall"
rm -rf $HOME/.codify
