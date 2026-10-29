import { describe, expect, it } from "vitest";
import type { SQLClient } from "./dialect.js";
import { SQLTransactionAbortedError, SQLTransactionState } from "./transaction.js";
import type { SQLTransactionConnection } from "./transaction.js";

/**
 * Fake connection recording its statements and lifecycle calls
 */
class FakeConnection implements SQLTransactionConnection {
  log: string[] = [];
  fail: { commit?: Error; rollback?: Error; query?: (q: string) => Error | undefined } = {};
  client: SQLClient = {
    query: async (q: string) => {
      this.log.push(q);
      const err = this.fail.query?.(q);
      if (err) throw err;
      return { rows: [{ q }], rowCount: 1 };
    }
  };

  async commit() {
    this.log.push("COMMIT");
    if (this.fail.commit) throw this.fail.commit;
  }

  async rollback() {
    this.log.push("ROLLBACK");
    if (this.fail.rollback) throw this.fail.rollback;
  }

  release(error?: unknown) {
    this.log.push(error ? `release:${(error as Error).message}` : "release");
  }
}

/**
 * @param open - the connection factory
 * @returns a state, its connection and the statements run on the fallback client
 */
function create(open?: () => Promise<SQLTransactionConnection>) {
  const connection = new FakeConnection();
  const opened: number[] = [];
  const fallback: string[] = [];
  const state = new SQLTransactionState(
    open ??
      (async () => {
        opened.push(1);
        return connection;
      }),
    () => ({
      query: async (q: string) => {
        fallback.push(q);
        return { rows: [], rowCount: 0 };
      }
    })
  );
  return { state, connection, opened, fallback };
}

describe("SQLTransactionState", () => {
  it("opens nothing for a transaction without statement", async () => {
    const { state, opened } = create();
    await state.commit();
    expect(opened).toHaveLength(0);
    expect(state.isFinished()).toBe(true);
    // Idempotent
    await state.commit();
    await state.rollback(new Error("late"));
  });

  it("opens the connection once for concurrent statements, then commits and releases", async () => {
    const { state, connection, opened } = create();
    const results = await Promise.all([state.query("A"), state.query("B"), state.query("C")]);
    expect(results.map(r => r.rows[0].q)).toEqual(["A", "B", "C"]);
    expect(opened).toHaveLength(1);
    expect(state.isOpen()).toBe(true);
    await state.commit();
    expect(connection.log).toEqual(["A", "B", "C", "COMMIT", "release"]);
  });

  it("rolls back and releases on rollback, running the rollback hooks", async () => {
    const { state, connection } = create();
    const hooks: string[] = [];
    state.onRollback(() => hooks.push("hook"));
    await state.query("A");
    await state.rollback(new Error("operation failed"));
    expect(connection.log).toEqual(["A", "ROLLBACK", "release"]);
    expect(hooks).toEqual(["hook"]);
    await state.commit();
    expect(connection.log).toHaveLength(3);
  });

  it("aborts after a failed statement: next statements and the commit fail, the work is rolled back", async () => {
    const { state, connection } = create();
    const duplicate = Object.assign(new Error("duplicate key"), { code: "23505" });
    connection.fail.query = q => (q === "DUP" ? duplicate : undefined);
    await state.query("A");
    await expect(state.query("DUP")).rejects.toBe(duplicate);
    await expect(state.query("B")).rejects.toBeInstanceOf(SQLTransactionAbortedError);
    const err = await state.commit().catch(e => e);
    expect(err).toBeInstanceOf(SQLTransactionAbortedError);
    expect(err.cause).toBe(duplicate);
    expect(connection.log).toEqual(["A", "DUP", "ROLLBACK", "release"]);
  });

  it("rolls back and destroys the connection when the commit fails", async () => {
    const { state, connection } = create();
    connection.fail.commit = new Error("serialization failure");
    await state.query("A");
    await expect(state.commit()).rejects.toThrow("serialization failure");
    expect(connection.log).toEqual(["A", "COMMIT", "ROLLBACK", "release:serialization failure"]);
  });

  it("destroys the connection and throws when the rollback fails", async () => {
    const { state, connection } = create();
    connection.fail.rollback = new Error("connection lost");
    await state.query("A");
    await expect(state.rollback(new Error("operation failed"))).rejects.toThrow("connection lost");
    expect(connection.log).toEqual(["A", "ROLLBACK", "release:connection lost"]);
  });

  it("runs the statements issued after the end on the fallback client", async () => {
    const { state, connection, fallback } = create();
    await state.query("A");
    await state.commit();
    await state.query("LATE");
    expect(fallback).toEqual(["LATE"]);
    expect(connection.log).toEqual(["A", "COMMIT", "release"]);
  });

  it("fails the statements and the commit when the connection cannot open", async () => {
    const refused = new Error("connection refused");
    const { state, connection } = create(async () => {
      throw refused;
    });
    await expect(state.query("A")).rejects.toBe(refused);
    await expect(state.commit()).rejects.toBeInstanceOf(SQLTransactionAbortedError);
    expect(connection.log).toEqual([]);
    // A rollback has nothing to release either
    const other = create(async () => {
      throw refused;
    });
    await expect(other.state.query("A")).rejects.toBe(refused);
    await other.state.rollback(refused);
  });
});

describe("transaction cleanup failures", () => {
  it("runs rollback hooks once even without opening a connection", async () => {
    const { state, opened } = create();
    let calls = 0;
    state.onRollback(() => calls++);
    await state.rollback();
    await state.rollback();
    expect(calls).toBe(1);
    expect(opened).toEqual([]);
  });

  it("preserves the commit error when rollback also fails", async () => {
    const { state, connection } = create();
    connection.fail.commit = new Error("commit failed");
    connection.fail.rollback = new Error("rollback failed");
    await state.query("A");
    await expect(state.commit()).rejects.toBe(connection.fail.commit);
    expect(connection.log).toEqual(["A", "COMMIT", "ROLLBACK", "release:commit failed"]);
  });

  it("rejects late statements when the store has no fallback client", async () => {
    const state = new SQLTransactionState(
      async () => new FakeConnection(),
      () => undefined
    );
    await state.commit();
    await expect(state.query("late")).rejects.toThrow("not initialized");
    expect(new SQLTransactionAbortedError("failure").message).toContain("failure");
  });
});
