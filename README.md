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
codify/0.0.0 darwin-arm64 node-v18.15.0
$ codify --help [COMMAND]
USAGE
  $ codify COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`codify apply [FILE]`](#codify-apply-file)
* [`codify hello PERSON`](#codify-hello-person)
* [`codify hello world`](#codify-hello-world)
* [`codify help [COMMANDS]`](#codify-help-commands)
* [`codify plan [FILE]`](#codify-plan-file)
* [`codify plugins`](#codify-plugins)
* [`codify plugins:install PLUGIN...`](#codify-pluginsinstall-plugin)
* [`codify plugins:inspect PLUGIN...`](#codify-pluginsinspect-plugin)
* [`codify plugins:install PLUGIN...`](#codify-pluginsinstall-plugin-1)
* [`codify plugins:link PLUGIN`](#codify-pluginslink-plugin)
* [`codify plugins:uninstall PLUGIN...`](#codify-pluginsuninstall-plugin)
* [`codify plugins:uninstall PLUGIN...`](#codify-pluginsuninstall-plugin-1)
* [`codify plugins:uninstall PLUGIN...`](#codify-pluginsuninstall-plugin-2)
* [`codify plugins update`](#codify-plugins-update)

## `codify apply [FILE]`

describe the command here

```
USAGE
  $ codify apply [FILE] [-f] [-n <value>]

ARGUMENTS
  FILE  file to read

FLAGS
  -f, --force
  -n, --name=<value>  name to print

DESCRIPTION
  describe the command here

EXAMPLES
  $ codify apply
```

_See code: [src/commands/apply.ts](https://github.com/kevinwang5658/codify/blob/v0.0.0/src/commands/apply.ts)_

## `codify hello PERSON`

Say hello

```
USAGE
  $ codify hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/kevinwang5658/codify/blob/v0.0.0/src/commands/hello/index.ts)_

## `codify hello world`

Say hello world

```
USAGE
  $ codify hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ codify hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/kevinwang5658/codify/blob/v0.0.0/src/commands/hello/world.ts)_

## `codify help [COMMANDS]`

Display help for codify.

```
USAGE
  $ codify help [COMMANDS] [-n]

ARGUMENTS
  COMMANDS  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for codify.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.2.20/src/commands/help.ts)_

## `codify plan [FILE]`

describe the command here

```
USAGE
  $ codify plan [FILE] [-f] [-n <value>] [-p <value>]

ARGUMENTS
  FILE  file to read

FLAGS
  -f, --force
  -n, --name=<value>  name to print
  -p, --path=<value>  path to project

DESCRIPTION
  describe the command here

EXAMPLES
  $ codify plan
```

_See code: [src/commands/plan/index.ts](https://github.com/kevinwang5658/codify/blob/v0.0.0/src/commands/plan/index.ts)_

## `codify plugins`

List installed plugins.

```
USAGE
  $ codify plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ codify plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.9.4/src/commands/plugins/index.ts)_

## `codify plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ codify plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ codify plugins add

EXAMPLES
  $ codify plugins:install myplugin 

  $ codify plugins:install https://github.com/someuser/someplugin

  $ codify plugins:install someuser/someplugin
```

## `codify plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ codify plugins:inspect PLUGIN...

ARGUMENTS
  PLUGIN  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ codify plugins:inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.9.4/src/commands/plugins/inspect.ts)_

## `codify plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ codify plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ codify plugins add

EXAMPLES
  $ codify plugins:install myplugin 

  $ codify plugins:install https://github.com/someuser/someplugin

  $ codify plugins:install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.9.4/src/commands/plugins/install.ts)_

## `codify plugins:link PLUGIN`

Links a plugin into the CLI for development.

```
USAGE
  $ codify plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help      Show CLI help.
  -v, --verbose
  --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ codify plugins:link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.9.4/src/commands/plugins/link.ts)_

## `codify plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ codify plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ codify plugins unlink
  $ codify plugins remove
```

## `codify plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ codify plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ codify plugins unlink
  $ codify plugins remove
```

_See
code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.9.4/src/commands/plugins/uninstall.ts)_

## `codify plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ codify plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ codify plugins unlink
  $ codify plugins remove
```

## `codify plugins update`

Update installed plugins.

```
USAGE
  $ codify plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.9.4/src/commands/plugins/update.ts)_
<!-- commandsstop -->
