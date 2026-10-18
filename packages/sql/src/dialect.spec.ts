import { describe, expect, it } from "vitest";
import { sqlString } from "./dialect.js";

describe("sqlString", () => {
  it("doubles single quotes and keeps backslashes", () => {
    expect(sqlString("x' OR 1=1 --")).toBe("'x'' OR 1=1 --'");
    expect(sqlString("c:\\dir")).toBe("'c:\\dir'");
  });
});
