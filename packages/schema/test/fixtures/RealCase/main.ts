export class RealCase {
  /**
   * An ArrayBuffer property
   */
  buffer!: ArrayBuffer;
  get property(): number {
    return 3;
  }
  set property(value: string | number) {
    // do nothing
  }
}
