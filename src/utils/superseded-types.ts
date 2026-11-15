import { ResourceDefinitionMap } from '../plugins/plugin-manager.js';

/**
 * Remove the types that are superseded by another type in the same list (ex: `alias` is superseded by `aliases`).
 * Both resources manage the same system state, so importing both automatically (init / import all) would import the
 * same state twice. A superseded type is kept if the type that supersedes it isn't in the list.
 */
export function removeSupersededTypes(typeIds: string[], resourceDefinitions: ResourceDefinitionMap): string[] {
  const typeIdSet = new Set(typeIds);

  return typeIds.filter((typeId) => {
    const supersededBy = resourceDefinitions.get(typeId)?.supersededBy;
    return !supersededBy || !typeIdSet.has(supersededBy);
  });
}
