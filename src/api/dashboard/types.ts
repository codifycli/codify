import { Config } from 'codify-schemas';

export interface CloudDocument {
  id: string;
  contents: Array<Config>
}
