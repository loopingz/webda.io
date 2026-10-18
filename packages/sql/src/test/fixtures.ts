/** A model without metadata */
export class Row {
  uuid: string;
  [key: string]: any;
  /**
   * @param data - initial data
   */
  constructor(data?: any) {
    Object.assign(this, data);
  }
}

/** Parent and child models sharing one table */
export class Animal extends Row {
  static Metadata = { Identifier: "Test/Animal", Subclasses: [] as any[] };
}
export class Dog extends Animal {
  static Metadata = { Identifier: "Test/Dog", Subclasses: [] as any[] };
}
export class Cat extends Animal {
  static Metadata = { Identifier: "Test/Cat", Subclasses: [] as any[] };
}
Animal.Metadata.Subclasses.push(Dog, Cat);

/** Two unrelated models sharing a table */
export class AggA extends Row {
  static Metadata = { Identifier: "Test/AggA", Subclasses: [] as any[] };
}
export class AggB extends Row {
  static Metadata = { Identifier: "Test/AggB", Subclasses: [] as any[] };
}

/** Rows covering numbers, booleans, strings, missing fields, nulls and type mismatches */
export const PARITY_ROWS = [
  { uuid: "r1", n: 1, s: "x", b: true, tags: ["x", 1] },
  { uuid: "r2", n: 5, s: "abc", b: false, tags: ["y"] },
  { uuid: "r3" },
  { uuid: "r4", n: "abc", s: 1, b: "true", tags: "x" },
  { uuid: "r5", s: null }
];
/** Queries whose results must be the same on every store */
export const PARITY_QUERIES = [
  "n < 2",
  "n <= 1",
  "n = 1",
  "n != 1",
  "n > 1",
  "n >= 5",
  "n IN [1, 5]",
  "n = 'abc'",
  "b = TRUE",
  "b = FALSE",
  "b != TRUE",
  "s = 'x'",
  "s != 'x'",
  "s = 1",
  "s LIKE 'a%'",
  "s IS NULL",
  "n IS NOT NULL",
  "tags CONTAINS 'x'",
  "n < 2 OR b = TRUE"
];
