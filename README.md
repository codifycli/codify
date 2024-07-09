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
codify/0.0.1 darwin-arm64 node-v20.15.0
$ codify --help [COMMAND]
USAGE
  $ codify COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`codify apply`](#codify-apply)
* [`codify help [COMMAND]`](#codify-help-command)
* [`codify plan`](#codify-plan)
* [`codify plugins`](#codify-plugins)
* [`codify plugins add PLUGIN`](#codify-plugins-add-plugin)
* [`codify plugins:inspect PLUGIN...`](#codify-pluginsinspect-plugin)
* [`codify plugins install PLUGIN`](#codify-plugins-install-plugin)
* [`codify plugins link PATH`](#codify-plugins-link-path)
* [`codify plugins remove [PLUGIN]`](#codify-plugins-remove-plugin)
* [`codify plugins reset`](#codify-plugins-reset)
* [`codify plugins uninstall [PLUGIN]`](#codify-plugins-uninstall-plugin)
* [`codify plugins unlink [PLUGIN]`](#codify-plugins-unlink-plugin)
* [`codify plugins update`](#codify-plugins-update)
* [`codify uninstall`](#codify-uninstall)

## `codify apply`

Apply a codify.json file. Codify apply will first generate a plan of the changes needed to meet the desired config in the codify.json file. The user will have the option to then apply the plan.

```
USAGE
  $ codify apply [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     path to project
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Apply a codify.json file. Codify apply will first generate a plan of the changes needed to meet the desired config in
  the codify.json file. The user will have the option to then apply the plan.

EXAMPLES
  $ codify apply
```

_See code: [src/commands/apply/index.ts](https://github.com/kevinwang5658/codify/blob/v0.0.1/src/commands/apply/index.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.4/src/commands/help.ts)_

## `codify plan`

Generate a plan based on a codify.json file. This plan will list out the changes Codify will need to make in order to meet the desired config.

```
USAGE
  $ codify plan [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     path to project
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generate a plan based on a codify.json file. This plan will list out the changes Codify will need to make in order to
  meet the desired config.

EXAMPLES
  $ codify plan
```

_See code: [src/commands/plan/index.ts](https://github.com/kevinwang5658/codify/blob/v0.0.1/src/commands/plan/index.ts)_

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

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.3.3/src/commands/plugins/index.ts)_

## `codify plugins add PLUGIN`

Installs a plugin into codify.

```
USAGE
  $ codify plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into codify.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the CODIFY_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the CODIFY_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ codify plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ codify plugins add myplugin

  Install a plugin from a github url.

    $ codify plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ codify plugins add someuser/someplugin
```

## `codify plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ codify plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ codify plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.3.3/src/commands/plugins/inspect.ts)_

## `codify plugins install PLUGIN`

Installs a plugin into codify.

```
USAGE
  $ codify plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into codify.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the CODIFY_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the CODIFY_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ codify plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ codify plugins install myplugin

  Install a plugin from a github url.

    $ codify plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ codify plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.3.3/src/commands/plugins/install.ts)_

## `codify plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ codify plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ codify plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.3.3/src/commands/plugins/link.ts)_

## `codify plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ codify plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ codify plugins unlink
  $ codify plugins remove

EXAMPLES
  $ codify plugins remove myplugin
```

## `codify plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ codify plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.3.3/src/commands/plugins/reset.ts)_

## `codify plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ codify plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ codify plugins unlink
  $ codify plugins remove

EXAMPLES
  $ codify plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.3.3/src/commands/plugins/uninstall.ts)_

## `codify plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ codify plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ codify plugins unlink
  $ codify plugins remove

EXAMPLES
  $ codify plugins unlink myplugin
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

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.3.3/src/commands/plugins/update.ts)_

## `codify uninstall`

Uninstall a given resource based on id.

```
USAGE
  $ codify uninstall [--json] [--debug] [-o plain|default|debug|json] [-s]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Uninstall a given resource based on id.

EXAMPLES
  $ codify uninstall
```

_See code: [src/commands/uninstall.ts](https://github.com/kevinwang5658/codify/blob/v0.0.1/src/commands/uninstall.ts)_
<!-- commandsstop -->
