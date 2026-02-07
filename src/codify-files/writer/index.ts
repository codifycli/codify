export enum SaveType {
  EXISTING,
  NEW,
  NONE
}


export class CodifyWriter {
  static async save(location: string, contents: string, type: SaveType): Promise<void> {
  }
}
