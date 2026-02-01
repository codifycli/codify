import { Config } from 'codify-schemas';

export interface RemoteDocument {
  id: string;
  contents: Array<Config>
}
