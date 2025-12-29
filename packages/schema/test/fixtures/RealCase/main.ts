export class RealCase {
  constructor() {
    // do nothing
  }
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

  /**
   * @SchemaIgnore
   */
  myProperty: string | number = "test";
}
