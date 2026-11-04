import { describe, expect, it } from "vitest";
import type { SQLClient } from "../dialect.js";
import { AsyncMutex, runTransaction } from "./transaction.js";

/**
 * @param failOn - statements that reject
 * @returns a client recording its statements
 */
function fakeClient(failOn: string[] = []): SQLClient & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    query: async (q: string) => {
      log.push(q);
      if (failOn.includes(q)) {
        throw new Error(`failed: ${q}`);
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

describe("runTransaction", () => {
  it("commitsInOrder", async () => {
    const client = fakeClient();
    const result = await runTransaction(client, async tx => {
      await tx.query("INSERT 1");
      return 42;
    });
    expect(result).toBe(42);
    expect(client.log).toEqual(["BEGIN", "INSERT 1", "COMMIT"]);
  });

  it("rollsBackAndRethrows", async () => {
    const client = fakeClient(["INSERT 1"]);
    await expect(runTransaction(client, tx => tx.query("INSERT 1"))).rejects.toThrow("failed: INSERT 1");
    expect(client.log).toEqual(["BEGIN", "INSERT 1", "ROLLBACK"]);
    // The original error survives a failing ROLLBACK
    const broken = fakeClient(["INSERT 1", "ROLLBACK"]);
    await expect(runTransaction(broken, tx => tx.query("INSERT 1"))).rejects.toThrow("failed: INSERT 1");
    expect(broken.log).toEqual(["BEGIN", "INSERT 1", "ROLLBACK"]);
  });
});

describe("AsyncMutex", () => {
  it("mutexSerializes", async () => {
    const mutex = new AsyncMutex();
    const order: string[] = [];
    let release!: () => void;
    const first = mutex.run(async () => {
      order.push("first start");
      await new Promise<void>(resolve => (release = resolve));
      order.push("first end");
      throw new Error("first failed");
    });
    const second = mutex.run(async () => {
      order.push("second");
      return "ok";
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(order).toEqual(["first start"]);
    release();
    await expect(first).rejects.toThrow("first failed");
    expect(await second).toBe("ok");
    expect(order).toEqual(["first start", "first end", "second"]);
  });
});
