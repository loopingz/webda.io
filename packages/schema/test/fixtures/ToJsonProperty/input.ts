/**
 * A class that serializes to a string via toJSON()
 */
class Link<T> {
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  toJSON(): string {
    return this.key;
  }

  get(): Promise<T> {
    return undefined as any;
  }
}

/**
 * A class that serializes to a number via toJSON()
 */
class Counter {
  private count: number = 0;

  toJSON(): number {
    return this.count;
  }
}

type LinkAlias<T> = Link<T>;

class Target {
  name!: string;
}

export class Model {
  title!: string;
  link!: Link<Target>;
  linkAlias!: LinkAlias<Target>;
  counter!: Counter;
}
