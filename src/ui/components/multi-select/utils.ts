export function arrRotate<T>(input: Array<T>, n: number): Array<T> {
  if (!Array.isArray(input)) {
    throw new TypeError(`Expected an array, got ${typeof input}`);
  }

  const x = [...input];
  return x.splice(-n % x.length).concat(x);
}
