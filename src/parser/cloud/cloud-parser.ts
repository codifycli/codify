import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';
import { SourceMapCache } from '../source-maps.js';

export class CloudParser implements LanguageSpecificParser {
    parse(file: InMemoryFile, sourceMaps: SourceMapCache): ParsedConfig[] {
        throw new Error('Method not implemented.');
    }

}
