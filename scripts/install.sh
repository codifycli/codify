#!/bin/bash
{
    set -e
    SUDO=''
    if [ "$(id -u)" != "0" ]; then
      SUDO='sudo'
      echo "This script requires superuser access."
      echo "You will be prompted for your password by sudo."
      # clear any previous sudo permission
      sudo -k
    fi


    # run inside sudo
    $SUDO bash <<SCRIPT
  set -e

  echoerr() { echo "\$@" 1>&2; }

  if [ "\$(uname)" == "Darwin" ]; then
    OS=darwin
  elif [ "\$(expr substr \$(uname -s) 1 5)" == "Linux" ]; then
    OS=linux
  else
    echoerr "This installer is only supported on Linux and macOS"
    exit 1
  fi

  ARCH="\$(uname -m)"
  if [ "\$ARCH" == "x86_64" ]; then
    ARCH=x64
  elif [[ "\$ARCH" == aarch* ]]; then
    ARCH=arm64
  elif [[ "\$ARCH" == "arm64" ]]; then
    ARCH=arm64
  else
    echoerr "unsupported arch: \$ARCH"
    exit 1
  fi

  if [[ ! ":$PATH:" == *":/usr/local/bin:"* ]]; then
    echoerr "Your path is missing /usr/local/bin, you need to add this to use this installer."
    exit 1
  fi

  mkdir -p /usr/local/lib
  mkdir -p /usr/local/bin

  cd /usr/local/lib
  rm -rf codify
  rm -rf ~/.local/share/codify/client
  if [ \$(command -v xz) ]; then
    URL=https://releases.codifycli.com/channels/stable/codify-\$OS-\$ARCH.tar.xz
    TAR_ARGS="xJ"
  else
    URL=https://releases.codifycli.com/channels/stable/codify-\$OS-\$ARCH.tar.gz
    TAR_ARGS="xz"
  fi
  echo "Installing CLI from \$URL"
  if [ \$(command -v curl) ]; then
    if [ "\$OS" = "darwin" ]; then
      curl "\$URL" | tar "\$TAR_ARGS"
    else
      curl "\$URL" | tar "\$TAR_ARGS" --warning=no-unknown-keyword
    fi
  else
    if [ "\$OS" = "darwin" ]; then
      wget -O- "\$URL" | tar "\$TAR_ARGS"
    else
      wget -O- "\$URL" | tar "\$TAR_ARGS" --warning=no-unknown-keyword
    fi
  fi
  # delete old codify bin if exists
  rm -f \$(command -v codify) || true
  rm -f /usr/local/bin/codify
  ln -s /usr/local/lib/codify/bin/codify /usr/local/bin/codify

  # on alpine (and maybe others) the basic node binary does not work
  # remove our node binary and fall back to whatever node is on the PATH
  /usr/local/lib/codify/bin/node -v || rm /usr/local/lib/codify/bin/node

SCRIPT
  # test the CLI
  LOCATION=$(command -v codify)

  CYAN='\033[0;36m'
  END_ESCAPE='\033[0m'

  printf "${CYAN}\n🎉 %s 🎉\n%s${END_ESCAPE}\n" "Successfully installed Codify. Type codify --help for a list of commands." "Visit the documentation at https://codifycli.com/docs for more info."
  exit 0;
}
