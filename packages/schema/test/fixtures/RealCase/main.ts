export class RealCase {
  buffer!: ArrayBuffer | string;
  get property(): number {
    return 3;
  }
  set property(value: string | number) {
    // do nothing
  }
}
