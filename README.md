oclif-hello-world
=================

oclif example Hello World CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![CircleCI](https://circleci.com/gh/oclif/hello-world/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/hello-world/tree/main)
[![GitHub license](https://img.shields.io/github/license/oclif/hello-world)](https://github.com/oclif/hello-world/blob/main/LICENSE)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g codify
$ codify COMMAND
running command...
$ codify (--version)
codify/0.4.0 darwin-arm64 node-v20.15.0
$ codify --help [COMMAND]
USAGE
  $ codify COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`codify help [COMMAND]`](#codify-help-command)
* [`codify update [CHANNEL]`](#codify-update-channel)

## `codify help [COMMAND]`

Display help for codify.

```
USAGE
  $ codify help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for codify.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.18/src/commands/help.ts)_

## `codify update [CHANNEL]`

update the codify CLI

```
USAGE
  $ codify update [CHANNEL] [--force |  | [-a | -v <value> | -i]] [-b ]

FLAGS
  -a, --available        See available versions.
  -b, --verbose          Show more details about the available versions.
  -i, --interactive      Interactively select version to install. This is ignored if a channel is provided.
  -v, --version=<value>  Install a specific version.
      --force            Force a re-download of the requested version.

DESCRIPTION
  update the codify CLI

EXAMPLES
  Update to the stable channel:

    $ codify update stable

  Update to a specific version:

    $ codify update --version 1.0.0

  Interactively select version:

    $ codify update --interactive

  See available versions:

    $ codify update --available
```

_See code: [@oclif/plugin-update](https://github.com/oclif/plugin-update/blob/v4.6.13/src/commands/update.ts)_
<!-- commandsstop -->
