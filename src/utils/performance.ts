import { performance } from 'node:perf_hooks';

export class Performance {
  static async measure<T>(fn: () => Promise<T> | T, tag?: string): Promise<T> {
    console.log(`${tag ?? 'Function measurement'} started`);

    const start = performance.now();
    const result = await fn();

    console.log(`${tag ?? 'Function measurement'} took ${(performance.now() - start).toFixed(3)} ms to complete`);
    return result;
  }

}
