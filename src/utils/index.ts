export function groupBy<T>(arr: T[], grouper: (item: T) => string): Record<string, T[]> {
  // eslint-disable-next-line unicorn/no-array-reduce
  return arr.reduce((result, curr) => {
    const key = grouper(curr);
    if (!result[key]) {
      result[key] = [] as T[];
    }

    result[key].push(curr);
    return result;
  }, {} as Record<string, T[]>)
}

export function getTypeAndNameFromId(id: string): { type: string; name: string | undefined } {
  const [type, ...nameParts] = id.split('.');

  return {
    type,
    name: nameParts.length === 0 ? undefined : nameParts.join('.')
  }
}

export function getId(type: string, name?: string): string {
  return name ? `${type}.${name}` : type;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  });
}

export function deepEqual(obj1: unknown, obj2: unknown): boolean {
  // Base case: If both objects are identical, return true.
  if (obj1 === obj2) {
    return true;
  }

  // Check if both objects are objects and not null.
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
    return false;
  }

  // Get the keys of both objects.
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  // Check if the number of keys is the same.
  if (keys1.length !== keys2.length) {
    return false;
  }

  // Iterate through the keys and compare their values recursively.
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  // If all checks pass, the objects are deep equal.
  return true;
}
