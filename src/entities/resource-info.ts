import { GetResourceInfoResponseData } from '@codifycli/schemas';

import { ResourceConfig } from './resource-config.js';

interface ParameterInfo {
  name: string;
  type?: string;
  description?: string;
  isRequiredForImport: boolean;
  value?: unknown;
}

export class ResourceInfo implements GetResourceInfoResponseData {
  plugin!: string;
  type!: string;
  schema?: Record<string, unknown> | undefined;
  dependencies?: string[] | undefined;
  importAndDestroy?: {
    preventImport?: boolean;
    requiredParameters: null | string[];
  } | undefined;

  allowMultiple!: boolean;

  private parametersCache?: ParameterInfo[];

  private constructor() {}

  get description(): string | undefined {
    return this.schema?.description as string | undefined;
  }

  get canImport(): boolean {
    return this.importAndDestroy?.preventImport !== true;
  }
  
  static fromResponseData(data: GetResourceInfoResponseData): ResourceInfo {
    const resourceInfo = new ResourceInfo()
    Object.assign(resourceInfo, data);
    return resourceInfo;
  }

  attachDefaultValues(resource: ResourceConfig): void {
    const parameterInfo = this.getParameterInfo();
    parameterInfo.forEach((info) => {
      const matchedParameter = resource.parameters[info.name];
      if (matchedParameter !== undefined) {
        info.value = matchedParameter;
      }
    })
  }
  
  getParameterInfo(): ParameterInfo[] {
    if (!this.parametersCache) {
      const { schema } = this;
      if (!schema || !schema.properties) {
        this.parametersCache = [];
        return [];
      }

      const { properties, required } = schema;
      if (!properties || typeof properties !== 'object') {
        this.parametersCache = [];
        return [];
      }

      this.parametersCache = Object.entries(properties)
        .map(([propertyName, info]) => {
          const isRequiredForImport = this.importAndDestroy?.requiredParameters?.some((name) => name === propertyName)
            ?? (required as string[] | undefined)?.includes(propertyName)
            ?? false;

          const isRequiredForDestroy = this.importAndDestroy?.requiredParameters?.some((name) => name === propertyName)
            ?? (required as string[] | undefined)?.includes(propertyName)
            ?? false;

          return {
            name: propertyName,
            type: info.type ?? null,
            description: info.description,
            isRequiredForImport,
            isRequiredForDestroy,
          }
        });
    }

    return this.parametersCache;
  }

  getRequiredParameters(): ParameterInfo[] {
    return this.getParameterInfo()
      .filter((info) => info.isRequiredForImport);
  }
}
