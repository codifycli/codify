import { RemoveMethods } from '../../../utils/types.js';

export class File {
  contents!: string;
  fileName!: string;
  fileType!: string;

  constructor(props: RemoveMethods<File>) {
    Object.assign(this, props);
  }

}
