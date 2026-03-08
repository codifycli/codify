# Codify - Your Development Environment as Code

Codify is a command-line tool that brings the power of Infrastructure as Code (IaC) to your local development environment. Manage system settings, install packages, and automate your setup using a simple, declarative configuration file.

- **Website**: [https://codifycli.com](https://codifycli.com)
- **Editor**: [https://dashboard.codifycli.com](https://dashboard.codifycli.com)
- **Documentation**: [https://docs.codifycli.com](https://docs.codifycli.com)

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![CircleCI](https://circleci.com/gh/kevinwang5658/codify/tree/main.svg?style=shield)](https://circleci.com/gh/kevinwang5658/codify/tree/main)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Why Codify?

Setting up a new development machine is often a tedious and manual process. Codify automates this by allowing you to define your desired state in a `codify.jsonc` file. This makes your environment reproducible, versionable, and easy to share.

## Key Features

- **Declarative Setup**: Define your entire local environment in a single file.
- **Plan & Apply Workflow**: See what changes will be made before they are executed.
- **Import Existing Setups**: Generate a Codify configuration from your currently installed packages.
- **Extensible Plugin System**: Create your own plugins to support any resource.
- **Web-Based Editor**: Use the [Codify Dashboard](https://dashboard.codifycli.com) for a powerful editing experience.

## Getting Started

1. **Install Codify:**

   ```sh-session
   /bin/bash -c "$(curl -fsSL https://releases.codifycli.com/install.sh)"
   ```

2. **Initialize a new project:**

   The `init` command will scan your system for installed packages and generate a `codify.jsonc` file for you.

   ```sh-session
   codify init
   ```

3. **Plan and Apply:**

   - Run `codify plan` to see what changes Codify will make.
   - Run `codify apply` to apply the changes.

## Commands

Here are some of the most common commands:

| Command           | Description                                              |
|-------------------|----------------------------------------------------------|
| `codify init`     | Initialize a new Codify project by scanning your system. |
| `codify import`   | Import existing resources into your `codify.jsonc` file. |
| `codify plan`     | Show the execution plan without applying any changes.    |
| `codify apply`    | Apply the changes to your system.                        |
| `codify destroy`  | Remove resources managed by Codify.                      |
| `codify validate` | Validate your `codify.jsonc` file.                       |
| `codify connect`  | Connect the CLI to the Codify Dashboard.                 |
| `codify login`    | Log in to your Codify account.                           |
| `codify test`     | Launch a VM to test a Codify config                      |

For a full list of commands and options, run `codify --help`.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).
