export const VerbosityLevel = new class {
  level = 0;

  get() {
    return this.level;
  }

  set(level: number) {
    this.level = level;
  }
}
