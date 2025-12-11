const TEST = Symbol("TEST");

// Discriminated union test types
export type TextNode = { kind: 'text'; value: string; [TEST]?: string };
export type CountNode = { kind: 'count'; value: number };
export type Node = TextNode | CountNode;
