// Represents a mock of the operating system. It stores a representation of what
// a resource does to the system
export const MockOs = new class {
  state = new Map<string, any>();

  constructor() {
    this.state.set('xcode-tools', {});
  }

  refresh<T>(key: string): Partial<T> | null {
    return this.state.get(key)
  }

  create<T>(key: string, newState: Partial<T>): void {
    this.state.set(key, newState);
  }

  modify<T>(key: string, newState: Partial<T>): void {
    this.state.set(key, newState);
  }

  destroy(key: string): void {
    this.state.delete(key)
  }

  reset() {
    this.state = new Map();
    this.state.set('xcode-tools', {});
  }

  get<T>(key: string): Partial<T> {
    return this.state.get(key);
  }

  getAll(): Map<string, any> {
    return this.state;
  }
}
