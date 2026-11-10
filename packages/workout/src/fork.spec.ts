import * as assert from "assert";
import { EventEmitter } from "node:events";
import { describe, it, vi } from "vitest";
import { useWorkerOutput, WorkerInput, WorkerInputType, WorkerLog, WorkerMessage, WorkerOutput } from "./core.js";
import { Fork, ForkParentLogger } from "./fork.js";

let currentMockChild: MockChildProcess;

class MockChildProcess extends EventEmitter {
  send = vi.fn((_msg: string) => true);
  kill = vi.fn();
}

vi.mock("node:child_process", () => ({
  fork: vi.fn(() => {
    currentMockChild = new MockChildProcess();
    return currentMockChild;
  })
}));

describe("Fork", () => {
  it("ForkParentLogger handles non-forked, forked, error, and flush", async () => {
    const output = new WorkerOutput();
    const logger = new ForkParentLogger(output);
    const origSend = process.send;
    try {
      delete (process as any).send;
      logger.onMessage(new WorkerMessage("log", output, { log: new WorkerLog("INFO", "hi") }));
      assert.strictEqual(logger.pending, 0);

      let pendingCallback: (() => void) | undefined;
      (process as any).send = vi.fn((_msg: string, cb: () => void) => {
        pendingCallback = cb;
      });
      logger.onMessage(new WorkerMessage("log", output, { log: new WorkerLog("INFO", "hi") }));
      assert.strictEqual(logger.pending, 1);
      setTimeout(() => pendingCallback?.(), 5);
      await logger.flush(500);
      assert.strictEqual(logger.pending, 0);

      // Timeout case
      logger.pending = 1;
      await assert.rejects(() => logger.flush(5), /Timeout waiting for pending messages/);
      logger.pending = 0;

      // Error in process.send
      (process as any).send = vi.fn(() => {
        throw new Error("IPC closed");
      });
      logger.onMessage(new WorkerMessage("log", output, { log: new WorkerLog("INFO", "hi") }));
    } finally {
      if (origSend) {
        process.send = origSend;
      } else {
        delete (process as any).send;
      }
      logger.close();
    }
  });

  it("Fork in child mode (process.send defined) succeeds and handles errors", async () => {
    const origSend = process.send;
    const origExit = process.exit;
    const exitCodes: (number | undefined)[] = [];
    try {
      useWorkerOutput().setInteractive(true);
      (process as any).send = vi.fn((_msg: string, cb?: () => void) => {
        cb?.();
        return true;
      });
      (process as any).exit = vi.fn((code?: number) => {
        exitCodes.push(code);
      });

      await Fork(async () => {
        const out = useWorkerOutput();
        const inputPromise = out.requestInput("Name");
        const uuids = Object.keys(out.inputs);
        // Emit same-pid message (ignored)
        process.emit(
          "message" as any,
          "ForkParentLogger:" +
            JSON.stringify({
              type: "input.received",
              pid: process.pid,
              groups: [],
              progresses: {},
              timestamp: Date.now(),
              input: { uuid: uuids[0], title: "Name", type: WorkerInputType.STRING, value: "Ignored", validators: [] }
            })
        );
        // Emit parent input.received message
        process.emit(
          "message" as any,
          "ForkParentLogger:" +
            JSON.stringify({
              type: "input.received",
              pid: process.pid + 1,
              groups: [],
              progresses: {},
              timestamp: Date.now(),
              input: { uuid: uuids[0], title: "Name", type: WorkerInputType.STRING, value: "Alice", validators: [] }
            })
        );
        // Emit non-matching message
        process.emit("message" as any, "other");
        assert.strictEqual(await inputPromise, "Alice");
      });
      assert.strictEqual(exitCodes[0], 0);

      // Child callback throws Error
      await Fork(() => {
        throw new Error("boom");
      });
      assert.strictEqual(exitCodes[1], 1);

      // Child callback throws non-Error
      await Fork(() => {
        throw "string error";
      });
      assert.strictEqual(exitCodes[2], 1);
    } finally {
      if (origSend) {
        process.send = origSend;
      } else {
        delete (process as any).send;
      }
      process.exit = origExit;
    }
  });

  it("Fork in parent mode forwards events and handles child exit", async () => {
    const origSend = process.send;
    delete (process as any).send;
    try {
      const parentOutput = new WorkerOutput();
      const forwarded: any[] = [];
      parentOutput.on("message", msg => forwarded.push(msg));

      const p = Fork(
        () => {},
        () => {
          // Parent callback runs once child is spawned
          const input = new WorkerInput("u1", "Q");
          input.value = "A";
          parentOutput.emit("message", new WorkerMessage("input.received", parentOutput, { input }));

          // Make child.send throw once to cover catch block
          currentMockChild.send.mockImplementationOnce(() => {
            throw new Error("send error");
          });
          parentOutput.emit("message", new WorkerMessage("input.timeout", parentOutput, { input }));

          // Child sends message back to parent
          const childMsg = new WorkerMessage("log", new WorkerOutput(), { log: new WorkerLog("INFO", "from child") });
          (childMsg as any).pid = process.pid + 99;
          currentMockChild.emit("message", "ForkParentLogger:" + JSON.stringify(childMsg));
          currentMockChild.emit("message", "unrelated");
          currentMockChild.emit("error", new Error("child error"));
          process.emit("exit", 0);
          setImmediate(() => currentMockChild.emit("exit", 0));
        },
        parentOutput
      );
      await p;
      assert.ok(currentMockChild.kill.mock.calls.length > 0);

      // Non-zero exit code rejects
      const pFail = Fork(
        () => {},
        () => {
          setImmediate(() => currentMockChild.emit("exit", 2));
        },
        parentOutput
      );
      await assert.rejects(() => pFail, /Child process exited with code 2/);
    } finally {
      if (origSend) {
        process.send = origSend;
      }
    }
  });
});
