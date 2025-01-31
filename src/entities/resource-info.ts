import { GetResourceInfoResponseData } from 'codify-schemas';

interface ParameterInfo {
  name: string;
  type?: string;
  description?: string;
  isRequired: boolean;
  value: unknown;
}

export class ResourceInfo implements GetResourceInfoResponseData {
  plugin!: string;
  type!: string;
  schema?: Record<string, unknown> | undefined;
  dependencies?: string[] | undefined;
  import?: { requiredParameters: null | string[]; } | undefined;

  get description(): string | undefined {
    return this.schema?.description as string | undefined;
  }
  
  static fromResponseData(data: GetResourceInfoResponseData): ResourceInfo {
    const resourceInfo = new ResourceInfo()
    Object.assign(resourceInfo, data);
    return resourceInfo;
  }
  
  getParameterInfo(): ParameterInfo[] {
    const { schema } = this;
    if (!schema || !schema.properties) {
      return [];
    }

    const { properties } = schema;
    if (!properties || typeof properties !== 'object') {
      return [];
    }

    return Object.entries(properties)
      .map(([propertyName, info]) => {
        const isRequired = this.import?.requiredParameters?.some((name) => name === propertyName) ?? false

        return {
          name: propertyName,
          type: info.type ?? null,
          description: info.description,
          isRequired
        }
      })
  }

  getRequiredParameters(): ParameterInfo[] {
    return this.getParameterInfo()
      .filter((info) => info.isRequired);
  }
}
