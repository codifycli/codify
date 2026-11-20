// Same pattern as `validate` from the `uuid` package (RFC 9562 versions 1-8, plus the nil and max UUIDs)
const UUID_REGEX = /^(?:[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}
