import { describe, it, expect } from "vitest";
import { collapse, covers, expand, formatScope, intersect, InvalidScope, parseScope, scopeMatches } from "./scope.js";

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
});
