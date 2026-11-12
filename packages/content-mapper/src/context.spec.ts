import type { Checker } from "typescript/sync";
import { describe, expect, it } from "vitest";
import { memoizeChecker } from "./context.ts";

describe("memoizeChecker", () => {
  it("asks the checker once per distinct arguments and keeps the other queries", () => {
    const calls: unknown[][] = [];
    const type = { id: 1 };
    const other = { id: 2 };
    const checker = {
      typeToString(...args: unknown[]) {
        calls.push(args);
        return `type-${(args[0] as { id: number }).id}`;
      },
      getTypeOfSymbolAtLocation: (symbol: unknown, location: unknown) => (calls.push([symbol, location]), undefined),
      getApparentType: (apparent: unknown) => apparent,
      getJsDocTagsOfSymbol: () => [],
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeArguments: () => [],
      getPropertyOfType: () => undefined,
      isArrayLikeType: () => false
    } as unknown as Checker;
    const memoized = memoizeChecker(checker);

    expect(memoized.typeToString(type as any)).toBe("type-1");
    expect(memoized.typeToString(type as any)).toBe("type-1");
    expect(memoized.typeToString(other as any)).toBe("type-2");
    expect(calls).toEqual([[type], [other]]);

    // Every argument takes part in the key, and an undefined answer is kept too
    calls.length = 0;
    memoized.getTypeOfSymbolAtLocation(type as any, other as any);
    memoized.getTypeOfSymbolAtLocation(type as any, other as any);
    memoized.getTypeOfSymbolAtLocation(type as any, type as any);
    expect(calls).toEqual([
      [type, other],
      [type, type]
    ]);

    // Queries that are not memoized reach the checker
    expect(memoized.getApparentType(type as any)).toBe(type);
  });
});
