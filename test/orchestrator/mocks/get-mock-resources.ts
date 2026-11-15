import { type Resource } from '@codifycli/plugin-core';

import { MockActionResource, MockResource, MockXcodeToolsResource } from './resource';

export function getMockResources(): Array<Resource<any>> {
  return [new MockResource(), new MockXcodeToolsResource(), new MockActionResource()];
}
