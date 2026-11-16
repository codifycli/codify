// A real plugin process (forked by the CLI) serving the mock resources, for `codify prompt` end-to-end tests
import { Plugin, runPlugin } from '@codifycli/plugin-core';

import { getMockResources } from '../../orchestrator/mocks/get-mock-resources.js';

runPlugin(Plugin.create('default', getMockResources()));
