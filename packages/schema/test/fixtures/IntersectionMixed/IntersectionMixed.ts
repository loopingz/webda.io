interface BaseA {
  name: string;
}

interface BaseB {
  age: number;
}

interface OpenBase {
  x: number;
  [key: string]: any;
}

// Pure object intersection: can be fully merged
export type IntersectionPure = BaseA & BaseB;

// Intersection with open additional properties
export type IntersectionOpen = OpenBase & BaseB;

// Intersection with primitive (cannot fully merge)
export type IntersectionMixed = BaseA & string;
