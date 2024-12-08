#!/bin/bash
set -e;
# Always clean up tmp dir even if install fails
trap 'rm -rf $TEMP_DIR' EXIT

if [ $(uname -s) != "Darwin" ]; then
  echo "Only macOS systems are currently supported"
  exit 1;
fi;

ARCH=$(uname -m)
TEMP_DIR=$(mktemp -d -t "codify")

echo "Downloading installer...";
curl -L -o "$TEMP_DIR/codify-installer.pkg" "https://api.codifycli.com/v2/cli/releases/stable/$ARCH/installer";
echo "Downloaded Codify installer";

printf "\nRunning installer... (sudo may be required)\n";
sudo installer -pkg "$TEMP_DIR/codify-installer.pkg" -target /;

CYAN='\033[0;36m'
END_ESCAPE='\033[0m'

printf "${CYAN}\n🎉 %s 🎉\n%s${END_ESCAPE}\n" "Successfully installed Codify. Type codify --help for a list of commands." "Visit the documentation at https://docs.codifycli.com for more info."

exit 0;
