import { describe, expect, it } from "vitest";
import { rebase, settleConflict, strategyResolutions } from "./conflicts.js";
import type { LocalRecord } from "./record.js";

const ref = { model: "App/Task", key: "t" };
/**
 * @param partial - overrides
 * @returns a record
 */
const rec = (partial: Partial<LocalRecord>): LocalRecord => ({
  id: "App/Task|t",
  ref,
  base: { uuid: "t", title: "a", body: "x" },
  baseRev: 1,
  current: { uuid: "t", title: "a", body: "x" },
  state: "dirty",
  ...partial
});

describe("rebase", () => {
  it("clean merge keeps both edits and stays dirty", () => {
    const out = rebase(
      rec({ current: { uuid: "t", title: "mine", body: "x" } }),
      { uuid: "t", title: "a", body: "theirs" },
      2,
      {}
    )!;
    expect(out.state).toBe("dirty");
    expect(out.base).toEqual({ uuid: "t", title: "a", body: "theirs" });
    expect(out.baseRev).toBe(2);
    expect(out.current).toEqual({ uuid: "t", title: "mine", body: "theirs" });
  });

  it("identical result becomes synced", () => {
    const out = rebase(
      rec({ current: { uuid: "t", title: "b", body: "x" } }),
      { uuid: "t", title: "b", body: "x" },
      2,
      {}
    )!;
    expect(out.state).toBe("synced");
  });

  it("same field edited on both sides is a conflict", () => {
    const out = rebase(
      rec({ current: { uuid: "t", title: "mine", body: "x" } }),
      { uuid: "t", title: "theirs", body: "x" },
      2,
      {}
    )!;
    expect(out.state).toBe("conflict");
    expect(out.conflict?.result.conflicts.map(c => c.path)).toEqual(["/title"]);
    expect(out.conflict?.ancestor).toEqual({ uuid: "t", title: "a", body: "x" });
    expect(out.baseRev).toBe(2);
  });

  it("server delete vs local edit is a root delete-modify", () => {
    const out = rebase(rec({ current: { uuid: "t", title: "mine", body: "x" } }), null, 0, {})!;
    expect(out.state).toBe("conflict");
    expect(out.conflict?.result.conflicts[0]).toMatchObject({ path: "", kind: "delete-modify", theirs: undefined });
  });

  it("both deleted removes the record", () => {
    expect(rebase(rec({ current: null, state: "deleted" }), null, 0, {})).toBeNull();
  });

  it("local delete vs server edit is a root delete-modify", () => {
    const out = rebase(rec({ current: null, state: "deleted" }), { uuid: "t", title: "theirs", body: "x" }, 2, {})!;
    expect(out.conflict?.result.conflicts[0]).toMatchObject({ path: "", kind: "delete-modify", ours: undefined });
  });

  it("an open conflict is rebased on its original ancestor", () => {
    const open = rebase(
      rec({ current: { uuid: "t", title: "mine", body: "x" } }),
      { uuid: "t", title: "theirs", body: "x" },
      2,
      {}
    )!;
    const again = rebase(open, { uuid: "t", title: "theirs2", body: "y" }, 3, {})!;
    expect(again.state).toBe("conflict");
    expect(again.conflict?.ancestor).toEqual({ uuid: "t", title: "a", body: "x" });
    expect(again.base).toEqual({ uuid: "t", title: "theirs2", body: "y" });
    expect(again.baseRev).toBe(3);
    // Still ours vs theirs on the title; the body was only changed on the server
    expect(again.conflict?.result.conflicts.map(c => c.path)).toEqual(["/title"]);
    expect(again.conflict?.result.merged.body).toBe("y");
  });
});

describe("settleConflict", () => {
  it("choose ours on a field conflict re-queues the record", () => {
    const conflicted = rebase(
      rec({ current: { uuid: "t", title: "mine", body: "x" } }),
      { uuid: "t", title: "theirs", body: "x" },
      2,
      {}
    )!;
    const out = settleConflict(conflicted, new Map([["/title", { choose: "ours" }]]))!;
    expect(out.state).toBe("dirty");
    expect(out.current.title).toBe("mine");
    expect(out.baseRev).toBe(2);
    expect(out.conflict).toBeUndefined();
  });

  it("partial resolutions throw", () => {
    const conflicted = rebase(
      rec({ current: { uuid: "t", title: "m", body: "m" } }),
      { uuid: "t", title: "t", body: "t" },
      2,
      {}
    )!;
    expect(() => settleConflict(conflicted, new Map([["/title", { choose: "ours" }]]))).toThrow(/body/);
  });

  it("recreate after server delete", () => {
    const conflicted = rebase(rec({ current: { uuid: "t", title: "mine", body: "x" } }), null, 0, {})!;
    const out = settleConflict(conflicted, new Map([["", { choose: "ours" }]]))!;
    expect(out.state).toBe("created");
    expect(out.baseRev).toBe(0);
    expect(out.current.title).toBe("mine");
  });

  it("accept server delete", () => {
    const conflicted = rebase(rec({ current: { uuid: "t", title: "mine", body: "x" } }), null, 0, {})!;
    expect(settleConflict(conflicted, new Map([["", { choose: "theirs" }]]))).toBeNull();
  });

  it("a root conflict needs a root resolution", () => {
    const conflicted = rebase(rec({ current: { uuid: "t", title: "mine", body: "x" } }), null, 0, {})!;
    expect(() => settleConflict(conflicted, new Map([["/title", { choose: "ours" }]]))).toThrow(/object root/);
  });

  it("a root conflict accepts an explicit value", () => {
    const conflicted = rebase(rec({ current: { uuid: "t", title: "mine", body: "x" } }), null, 0, {})!;
    const out = settleConflict(conflicted, new Map([["", { value: { uuid: "t", title: "typed", body: "x" } }]]))!;
    expect(out.state).toBe("created");
    expect(out.current.title).toBe("typed");
    // A value equal to the server one needs no push, a different one is pushed
    const edited = rebase(rec({ current: null, state: "deleted" }), { uuid: "t", title: "s", body: "x" }, 2, {})!;
    const same = settleConflict(edited, new Map([["", { value: { uuid: "t", title: "s", body: "x" } }]]))!;
    expect(same.state).toBe("synced");
    const other = settleConflict(edited, new Map([["", { value: { uuid: "t", title: "typed", body: "x" } }]]))!;
    expect(other.state).toBe("dirty");
    expect(other.baseRev).toBe(2);
    expect(other.current.title).toBe("typed");
  });

  it("keep local delete over server edit", () => {
    const conflicted = rebase(
      rec({ current: null, state: "deleted" }),
      { uuid: "t", title: "theirs", body: "x" },
      2,
      {}
    )!;
    const out = settleConflict(conflicted, new Map([["", { choose: "ours" }]]))!;
    expect(out.state).toBe("deleted");
    expect(out.baseRev).toBe(2);
  });
});

describe("strategyResolutions", () => {
  const info: any = { result: { conflicts: [{ path: "/a" }, { path: "/b" }] } };
  it("maps the built-in strategies", async () => {
    expect(await strategyResolutions("manual", info)).toBe("defer");
    expect([...((await strategyResolutions("server-wins", info)) as Map<string, any>).values()]).toEqual([
      { choose: "theirs" },
      { choose: "theirs" }
    ]);
    expect([...((await strategyResolutions("client-wins", info)) as Map<string, any>).keys()]).toEqual(["/a", "/b"]);
    expect(await strategyResolutions(async () => "defer", info)).toBe("defer");
  });
});
