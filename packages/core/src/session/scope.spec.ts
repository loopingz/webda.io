import { describe, it, expect } from "vitest";
import {
  collapse,
  covers,
  expand,
  formatScope,
  intersect,
  InvalidScope,
  parseScope,
  scopeMatches,
  union
} from "./scope.js";

const OPS = ["Task.Get", "Task.Update", "Task.Comment.Add", "User.Me", "Auth.Me"];

describe("scope", () => {
  it("parses and normalizes", () => {
    expect(parseScope("Task.*  Auth.Me Task.* offline_access")).toEqual(["Task.*", "Auth.Me", "offline_access"]);
    expect(parseScope("")).toEqual([]);
    expect(parseScope(undefined)).toEqual([]);
    expect(formatScope(["Task.*", "offline_access"])).toBe("Task.* offline_access");
  });
  it("rejects invalid tokens", () => {
    for (const bad of ["Task.?", "Task/Get", "openid", "a b<c", "x".repeat(1025)]) {
      expect(() => parseScope(bad)).toThrow(InvalidScope);
    }
  });
  it("matches operations", () => {
    expect(scopeMatches(["Task.*"], "Task.Comment.Add")).toBe(true);
    expect(scopeMatches(["Task.*"], "User.Me")).toBe(false);
    expect(scopeMatches(["*"], "User.Me")).toBe(true);
    expect(scopeMatches(["offline_access"], "User.Me")).toBe(false);
  });
  it("covers", () => {
    expect(covers(["Task.*"], ["Task.Get", "Task.*.Add", "Task.*"])).toBe(true);
    expect(covers(["*"], ["Task.*", "offline_access"])).toBe(false);
    expect(covers(["*", "offline_access"], ["Task.*", "offline_access"])).toBe(true);
    expect(covers(["Task.Get"], ["Task.*"])).toBe(false);
    expect(covers(["Task.*"], [])).toBe(true);
  });
  it("intersects", () => {
    expect(intersect(["Task.*", "Auth.Me"], ["Task.Get", "User.*"])).toEqual(["Task.Get"]);
    expect(intersect(["*"], ["Task.*", "offline_access"])).toEqual(["Task.*"]);
    expect(intersect(["*", "offline_access"], ["Task.*", "offline_access"])).toEqual(["Task.*", "offline_access"]);
  });
  it("expands and collapses", () => {
    expect(expand(["Task.*"], OPS)).toEqual(["Task.Get", "Task.Update", "Task.Comment.Add"]);
    expect(collapse(["Task.Get", "Task.Update", "Task.Comment.Add"], ["Task.*", "Auth.Me"], OPS)).toEqual(["Task.*"]);
    expect(collapse(["Task.Get", "Auth.Me"], ["Task.*", "Auth.Me"], OPS)).toEqual(["Task.Get", "Auth.Me"]);
    // never widens beyond the request
    expect(collapse(["User.Me"], ["Task.*"], OPS)).toEqual([]);
  });
  it("collapses a broad request into group globs", () => {
    // Everything but Auth.Me: `*` cannot be kept, the fully selected groups can
    expect(collapse(["Task.Get", "Task.Update", "Task.Comment.Add", "User.Me"], ["*"], OPS)).toEqual([
      "Task.*",
      "User.*"
    ]);
    // A partially selected group stays a list of ids
    expect(collapse(["Task.Get", "User.Me"], ["*"], OPS)).toEqual(["Task.Get", "User.*"]);
    // Everything selected keeps the requested glob
    expect(collapse(OPS, ["*"], OPS)).toEqual(["*"]);
    // A group glob is only used when the request covers it: never widens
    const ids = ["Task.Get", "Task.Update", "Task.Comment.Add"];
    expect(collapse(ids, ids, OPS)).toEqual(ids);
    expect(collapse(["Task.Comment.Add"], ["Task.Comment.*"], OPS)).toEqual(["Task.Comment.*"]);
    // An id without a group is listed
    expect(collapse(["Ping"], ["*"], [...OPS, "Ping"])).toEqual(["Ping"]);
  });
});

describe("union", () => {
  it("de-duplicates, keeping the order of a then the new items of b", () => {
    expect(union(["Task.Get"], ["Task.Get", "Task.Update"])).toEqual(["Task.Get", "Task.Update"]);
    expect(union(["B", "A"], ["C", "A"])).toEqual(["B", "A", "C"]);
    expect(union([], [])).toEqual([]);
  });
});
