import { type Resource } from '@codifycli/plugin-core';

import { MockResource, MockXcodeToolsResource } from './resource';

export function getMockResources(): Array<Resource<any>> {
  return [new MockResource(), new MockXcodeToolsResource()];
}
