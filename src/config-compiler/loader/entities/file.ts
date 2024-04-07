import { RemoveMethods } from '../../../utils/types.js';

export class LoadedFile {
  contents!: string;
  fileName!: string;
  fileType!: string;

  constructor(props: RemoveMethods<LoadedFile>) {
    Object.assign(this, props);
  }

}
