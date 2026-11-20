import { isUuid } from '../utils/uuid.js';

import { DashboardApiClient } from '../api/dashboard/index.js';
import type { RegistryTemplate } from '../api/dashboard/types.js';
import { TemplateError } from '../common/errors.js';
import { LoginHelper } from '../connect/login-helper.js';
import { TemplateConfig } from '../entities/template-config.js';
import { FileType, InMemoryFile } from '../parser/entities.js';
import { RemoteReader } from '../parser/reader/remote-reader.js';

/** Loads the raw contents of a template declaration. */
export interface TemplateLoader {
  load(template: TemplateConfig): Promise<InMemoryFile>;
}

/**
 * Loads templates from the Codify API:
 *   - a uuid is a Codify dashboard document (requires login)
 *   - anything else is a registry template name (`name` or `@profile/name`, no login required)
 */
export class ApiTemplateLoader implements TemplateLoader {
  // Templates that were already fetched by the CodifyResolver (`codify apply <template>`), keyed by source. Fetched
  // templates are not cached otherwise: the CLI can be long running (codify connect) and templates change. Within a
  // single run every template is only loaded once by the TemplateExpander.
  private readonly seeded = new Map<string, RegistryTemplate>();

  seed(source: string, template: RegistryTemplate): void {
    this.seeded.set(source, template);
  }

  async load(template: TemplateConfig): Promise<InMemoryFile> {
    if (template.version) {
      // The registry does not support template versions yet
      throw new TemplateError(template.source, `Template versions are not supported yet. Remove "version": "${template.version}" from the template declaration.`);
    }

    if (isUuid(template.source)) {
      return this.loadDocument(template);
    }

    const seeded = this.seeded.get(template.source);
    this.seeded.delete(template.source);

    const registryTemplate = seeded ?? await DashboardApiClient.getTemplate(template.source).catch((error) => {
      throw new TemplateError(template.source, `Unable to fetch the template from the Codify registry: ${error instanceof Error ? error.message : error}`);
    });
    if (!registryTemplate) {
      throw new TemplateError(template.source, 'No template with this name was found in the Codify registry.');
    }

    return {
      contents: registryTemplate.rawConfigs,
      filePath: ApiTemplateLoader.filePath(template.source),
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
