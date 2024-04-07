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