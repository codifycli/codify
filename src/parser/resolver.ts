import * as fs from 'node:fs/promises';
import path from 'node:path';
import { isUuid } from '../utils/uuid.js';

import { DashboardApiClient } from '../api/dashboard/index.js';
import type { RegistryTemplate } from '../api/dashboard/types.js';
import { InvalidTargetsError, NoCodifyFilesError } from '../common/errors.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { closestMatch } from '../utils/levenshtein.js';
import { type CodifySource, CodifySourceType } from './entities.js';
import { CODIFY_FILE_REGEX } from './index.js';

export type { CodifySource } from './entities.js';
export { CodifySourceType } from './entities.js';

export interface ResolveArgs {
  // What the user passed in (path, document id, or template name). Defaults to the current directory.
  location?: string;
  // Allow `location` to resolve to a public template.
  allowTemplates?: boolean;
  // Return null instead of throwing when nothing is found.
  allowEmpty?: boolean;
}

/** How the arguments of `codify apply` / `codify plan` are read when --resource or --template is passed */
export type TargetKind = 'resource' | 'template';

export interface ResolveTargetsArgs {
  // The positional arguments (at least one)
  targets: string[];
  // --resource / --template: read every target as this kind. Detected otherwise.
  kind?: TargetKind;
  // The resource types of the plugins. Only called when a target can be a resource type (it starts the plugins).
  getResourceTypes: () => Promise<string[]>;
}

type TemplateLookup = { error: unknown } | { template: null | RegistryTemplate };

/**
 * Figures out which Codify config a command should run against.
 *
 * Resolution order:
 *   1. A UUID                  → the Codify dashboard document with that id
 *   2. An existing file        → that file
 *   3. An existing directory   → the codify file inside it (the user is prompted if there are several)
 *   4. Anything else           → the public template with that name (only if `allowTemplates` is set)
 *
 * If a directory (or the current directory when no location is given) has no codify files:
 *   5. Logged in               → the user's default dashboard document
 *   6. Otherwise               → null if `allowEmpty` is set, else NoCodifyFilesError (with usage help)
 */
export const CodifyResolver = {
  async resolve(args: ResolveArgs, reporter: Reporter): Promise<CodifySource | null> {
    const location = args.location ?? process.cwd();

    if (isUuid(location)) {
      return { type: CodifySourceType.REMOTE, documentId: location };
    }

    const stat = await fs.stat(path.resolve(location)).catch(() => null);

    if (stat?.isFile()) {
      return { type: CodifySourceType.LOCAL, path: path.resolve(location) };
    }

    if (stat?.isDirectory()) {
      const file = await CodifyResolver.pickFileInDir(location, reporter);
      if (file) {
        return { type: CodifySourceType.LOCAL, path: file };
      }

      return CodifyResolver.resolveFallback(location, args);
    }

    // Not on disk. Try the template registry.
    if (args.allowTemplates) {
      const template = await DashboardApiClient.getTemplate(location);
      if (template) {
        return { type: CodifySourceType.TEMPLATE, template, location };
      }
    }

    throw NoCodifyFilesError.notFound(location);
  },

  /**
   * Resolves the arguments of `codify apply` / `codify plan`. Each target is read in this order:
   *   1. A codify file: a document id, an existing file, a directory with codify files, or anything that looks like a
   *      path (./x, ~/x, a/b, x.jsonc). Resolved with `resolve`.
   *   2. A resource type of the plugins (`nvm`)
   *   3. A template (`@profile/name` is always a template, `name` only when it isn't a resource type)
   *
   * All targets must be of the same kind: one file, one template, or any number of resource types. --resource and
   * --template (`kind`) skip the detection. A resource type that is also the name of a template is returned in
   * `templateNameClashes` so that a hint can be shown.
   */
  async resolveTargets(args: ResolveTargetsArgs, reporter: Reporter): Promise<CodifySource | null> {
    const targets = [...new Set(args.targets.filter(Boolean))];
    if (targets.length === 0) {
      throw new InvalidTargetsError('At least one file, resource type or template must be specified.');
    }

    if (args.kind === 'resource') {
      return CodifyResolver.resolveResourceTypes(targets, await args.getResourceTypes());
    }

    if (args.kind === 'template') {
      return CodifyResolver.resolveTemplateName(targets);
    }

    const files: string[] = [];
    for (const target of targets) {
      if (await CodifyResolver.isFileTarget(target)) {
        files.push(target);
      }
    }

    if (files.length > 0) {
      if (targets.length > 1) {
        throw new InvalidTargetsError(files.length > 1
          ? `Only one codify file can be applied at a time. Received: ${quoteList(files)}.`
          : `"${files[0]}" is a codify file and can't be combined with other arguments (${quoteList(targets.filter((t) => t !== files[0]))}). Declare the resources or the template in the codify file instead.`);
      }

      return CodifyResolver.resolve({ location: targets[0] }, reporter);
    }

    return CodifyResolver.resolveResourcesOrTemplate(targets, args.getResourceTypes);
  },

  /** The target is a template name (--template) */
  async resolveTemplateName(targets: string[]): Promise<CodifySource> {
    if (targets.length > 1) {
      throw new InvalidTargetsError(`Only one template can be applied at a time. Received: ${quoteList(targets)}.`);
    }

    const template = await DashboardApiClient.getTemplate(targets[0]);
    if (!template) {
      throw new InvalidTargetsError(`No template named "${targets[0]}" was found in the Codify registry.`);
    }

    return { type: CodifySourceType.TEMPLATE, template, location: targets[0] };
  },

  /** Targets that are not files: resource types (any number) or a single template */
  async resolveResourcesOrTemplate(targets: string[], getResourceTypes: () => Promise<string[]>): Promise<CodifySource> {
    // Templates are looked up while the plugins start. For names that turn out to be resource types the result is
    // only used for the hint, so errors (ex: offline) are kept instead of thrown.
    const lookups = new Map<string, Promise<TemplateLookup>>(targets.map((target) => [
      target,
      DashboardApiClient.getTemplate(target)
        .then((template): TemplateLookup => ({ template }))
        .catch((error: unknown): TemplateLookup => ({ error })),
    ]));

    const canBeResourceType = targets.some((t) => !t.startsWith('@'));
    const resourceTypes = canBeResourceType ? await getResourceTypes() : [];
    const resources = targets.filter((t) => resourceTypes.includes(t));
    const templateCandidates = targets.filter((t) => !resourceTypes.includes(t));

    const templates: Array<{ name: string; template: RegistryTemplate }> = [];
    for (const name of templateCandidates) {
      const lookup = await lookups.get(name)!;
      if ('error' in lookup) {
        throw lookup.error;
      }

      if (!lookup.template) {
        throw NoCodifyFilesError.targetNotFound(name, name.startsWith('@') ? undefined : closestMatch(name, resourceTypes));
      }

      templates.push({ name, template: lookup.template });
    }

    if (resources.length > 0 && templates.length > 0) {
      const names = templates.map((t) => t.name);
      throw new InvalidTargetsError(`Resources and templates can't be applied together: ${quoteList(resources)} ${resources.length === 1 ? 'is a resource type' : 'are resource types'} and ${quoteList(names)} ${names.length === 1 ? 'is a template' : 'are templates'}. Declare them in a codify file instead, or apply them separately.`);
    }

    if (templates.length > 1) {
      throw new InvalidTargetsError(`Only one template can be applied at a time. Received: ${quoteList(templates.map((t) => t.name))}.`);
    }

    if (templates.length === 1) {
      return { type: CodifySourceType.TEMPLATE, template: templates[0].template, location: templates[0].name };
    }

    const templateNameClashes: string[] = [];
    for (const name of resources) {
      const lookup = await lookups.get(name)!;
      if ('template' in lookup && lookup.template) {
        templateNameClashes.push(name);
      }
    }

    return { type: CodifySourceType.RESOURCES, resourceTypes: resources, templateNameClashes };
  },

  /** Every target must be a resource type of the plugins (--resource) */
  resolveResourceTypes(targets: string[], resourceTypes: string[]): CodifySource {
    for (const target of targets) {
      if (!resourceTypes.includes(target)) {
        const suggestion = closestMatch(target, resourceTypes);
        throw new InvalidTargetsError(`"${target}" is not a resource type supported by the plugins${suggestion ? `. Did you mean "${suggestion}"?` : '.'}`);
      }
    }

    return { type: CodifySourceType.RESOURCES, resourceTypes: targets, templateNameClashes: [] };
  },

  /**
   * True if the target is a codify file: a document id, an existing file, a directory with codify files, or anything
   * that looks like a path. A directory without codify files (ex: `docker/` in a repository) is not a file target, so
   * `codify apply docker` applies the resource.
   */
  async isFileTarget(target: string): Promise<boolean> {
    if (isUuid(target)) {
      return true;
    }

    if (target.startsWith('@')) {
      return false;
    }

    const isPathLike = target.includes('/') || target.includes('\\') || target.startsWith('.') || target.startsWith('~')
      || /\.(?:jsonc?|json5|ya?ml)$/.test(target);
    if (isPathLike) {
      return true;
    }

    const stat = await fs.stat(path.resolve(target)).catch(() => null);
    if (stat?.isFile()) {
      return true;
    }

    if (stat?.isDirectory()) {
      const names = await fs.readdir(target).catch(() => [] as string[]);
      return names.some((name) => CODIFY_FILE_REGEX.test(name));
    }

    return false;
  },

  /** Returns the codify file in a directory, prompting the user to choose if there are several. */
  async pickFileInDir(dir: string, reporter: Reporter): Promise<null | string> {
    const codifyFiles = (await fs.readdir(dir))
      .filter((name) => CODIFY_FILE_REGEX.test(name))
      .sort();

    if (codifyFiles.length === 0) {
      return null;
    }

    if (codifyFiles.length === 1) {
      return path.resolve(dir, codifyFiles[0]);
    }

    const answer = await reporter.promptOptions(
      'Multiple codify files found in dir. Please select one:',
      codifyFiles,
    );

    return path.resolve(dir, codifyFiles[answer]);
  },

  /** No codify files on disk: fall back to the user's default dashboard document, or give up. */
  async resolveFallback(dir: string, args: ResolveArgs): Promise<CodifySource | null> {
    if (LoginHelper.get()?.isLoggedIn) {
      const documentId = await DashboardApiClient.getDefaultDocumentId();
      if (documentId) {
        return { type: CodifySourceType.REMOTE, documentId };
      }
    }

    if (args.allowEmpty) {
      return null;
    }

    throw NoCodifyFilesError.emptyDir(path.resolve(dir));
  },
};

function quoteList(values: string[]): string {
  return values.map((v) => `"${v}"`).join(', ');
}
