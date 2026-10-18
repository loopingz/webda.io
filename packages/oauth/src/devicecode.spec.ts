import { describe, it, expect } from "vitest";
import { formatUserCode, generateUserCode, normalizeUserCode, splitDeviceCode } from "./devicecode.js";

describe("user codes", () => {
  it("generates from the alphabet", () => {
    for (let i = 0; i < 200; i++) expect(generateUserCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/);
  });
  it("formats and normalizes", () => {
    expect(formatUserCode("BCDFGHJK")).toBe("BCDF-GHJK");
    expect(normalizeUserCode(" bcdf-ghjk ")).toBe("BCDFGHJK");
    expect(normalizeUserCode("bcdf ghjk")).toBe("BCDFGHJK");
    expect(normalizeUserCode("BCDF-GHJA")).toBeUndefined();
    expect(normalizeUserCode(42)).toBeUndefined();
  });
  it("splits device codes", () => {
    expect(splitDeviceCode("BCDFGHJK.c2VjcmV0")).toEqual({ userCode: "BCDFGHJK", secret: "c2VjcmV0" });
    expect(splitDeviceCode("nope")).toBeUndefined();
    expect(splitDeviceCode("BCDFGHJK.")).toBeUndefined();
  });
});

describe("user codes (negative)", () => {
  it("rejects malformed device codes", () => {
    expect(splitDeviceCode("BCDFGHJK.abc.def")).toBeUndefined();
    expect(splitDeviceCode("bcdfghjk.abc")).toBeUndefined();
    expect(splitDeviceCode(undefined)).toBeUndefined();
    expect(splitDeviceCode({})).toBeUndefined();
    expect(splitDeviceCode("")).toBeUndefined();
    expect(splitDeviceCode(`BCDFGHJK.${"a".repeat(129)}`)).toBeUndefined();
    expect(splitDeviceCode(`BCDFGHJK.${"a".repeat(128)}`)).toBeDefined();
  });
  it("rejects bad user codes", () => {
    expect(normalizeUserCode("BCDFGHJ")).toBeUndefined();
    expect(normalizeUserCode("BCDFGHJKL")).toBeUndefined();
    expect(normalizeUserCode("")).toBeUndefined();
    expect(normalizeUserCode("BCDFGHJ1")).toBeUndefined();
    expect(normalizeUserCode("AEIOUBCD")).toBeUndefined();
  });
});
