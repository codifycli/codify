import { Config } from '@codifycli/schemas';

export interface CloudDocument {
  id: string;
  contents: Array<Config>
}
