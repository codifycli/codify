import { type Resource } from 'codify-plugin-lib';

import { MockResource, MockXcodeToolsResource } from './resource';

export function getMockResources(): Array<Resource<any>> {
  return [new MockResource(), new MockXcodeToolsResource()];
}
