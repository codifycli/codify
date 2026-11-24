import { isUuid } from '../utils/uuid.js';

import { DashboardApiClient } from '../api/dashboard/index.js';
import type { RegistryTemplate } from '../api/dashboard/types.js';
import { TemplateError } from '../common/errors.js';
import { LoginHelper } from '../connect/login-helper.js';
import { TemplateConfig } from '../entities/template-config.js';
import { FileType, InMemoryFile } from '../parser/entities.js';
import { RemoteReader } from '../parser/reader/remote-reader.js';
import { TemplateUsage, templateUsage } from './template-usage.js';

/** Loads the raw contents of a template declaration. */
export interface TemplateLoader {
  load(template: TemplateConfig): Promise<InMemoryFile>;
}

/**
 * Loads templates from the Codify API:
 *   - a uuid is a Codify dashboard document (requires login)
 *   - anything else is a registry template name (`name` = `@codify/name`, or `@profile/name`, no login required),
 *     optionally pinned to a version with `version`
 */
export class ApiTemplateLoader implements TemplateLoader {
  // Templates that were already fetched by the CodifyResolver (`codify apply <template>`), keyed by source. Fetched
  // templates are not cached otherwise: the CLI can be long running (codify connect) and templates change. Within a
  // single run every template is only loaded once by the TemplateExpander.
  private readonly seeded = new Map<string, RegistryTemplate>();

  constructor(private readonly usage: TemplateUsage = templateUsage) {}

  /** `source` is the template's sourceKey (`@codify/nvm` or `@codify/nvm@1.2.0`). */
  seed(source: string, template: RegistryTemplate): void {
    this.seeded.set(source, template);
  }

  async load(template: TemplateConfig): Promise<InMemoryFile> {
    if (isUuid(template.source)) {
      if (template.version) {
        throw new TemplateError(template.source, `Dashboard documents don't have versions. Remove "version": "${template.version}" from the template declaration.`);
      }

      return this.loadDocument(template);
    }

    const seeded = this.seeded.get(template.sourceKey);
    this.seeded.delete(template.sourceKey);

    const registryTemplate = seeded ?? await DashboardApiClient.getTemplate(template.source, template.version).catch((error) => {
      throw new TemplateError(template.sourceKey, `Unable to fetch the template from the Codify registry: ${error instanceof Error ? error.message : error}`);
    });
    if (!registryTemplate) {
      throw new TemplateError(template.sourceKey, template.version
        ? `Version ${template.version} of this template was not found in the Codify registry.`
        : 'No template with this name was found in the Codify registry. Templates from other publishers need their scope: "@publisher/name".');
    }

    this.usage.record(registryTemplate);

    return {
      contents: registryTemplate.rawConfigs,
      filePath: ApiTemplateLoader.filePath(template.sourceKey),
      fileType: FileType.JSONC,
    };
  }

  /** The virtual file path of a template. Shown in error messages and used as the source map key. */
  static filePath(source: string): string {
    return `template:${source}`;
  }

  private async loadDocument(template: TemplateConfig): Promise<InMemoryFile> {
    if (!LoginHelper.get()?.isLoggedIn) {
      throw new TemplateError(template.source, 'Templates from Codify dashboard documents require you to be logged in. Run "codify login" first.');
    }

    const file = await new RemoteReader().read(template.source);
    return { ...file, filePath: ApiTemplateLoader.filePath(template.source) };
  }
}
