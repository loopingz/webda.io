import { ChildProcess, fork } from "node:child_process";
import { useLog, useWorkerOutput, WorkerMessage, WorkerMessageType, WorkerOutput } from "./core";
import { WorkerLogger } from "./loggers/index";

const PREFIX = "ForkParentLogger:";

export class ForkParentLogger extends WorkerLogger {
  pending: number = 0;
  onMessage(msg: WorkerMessage): void {
    try {
      this.pending++;
      process.send("ForkParentLogger: " + JSON.stringify(msg), () => {
        this.pending--;
      });
    } catch (err) {
      console.error("Failed to send message to parent process", err);
    }
  }

  flush(timeout: number = 30000): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const checkPending = () => {
        if (this.pending === 0) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error("Timeout waiting for pending messages to flush"));
        } else {
          setImmediate(checkPending);
        }
      };
      checkPending();
    });
  }
}

export async function Fork(
  callback: () => void | Promise<void>,
  parentCallback?: () => void | Promise<void>,
  output?: WorkerOutput
) {
  let child: ChildProcess;
  if (process.send === undefined) {
    child = fork(process.argv[1], process.argv.slice(2), { env: { FORKED: "true" } });
  }
  if (process.send !== undefined) {
    const currentOutput = useWorkerOutput();
    // We are in a forked process so create a new WorkerOutput and
    // forward all to the parent process
    const output = useWorkerOutput(new WorkerOutput());
    output.setInteractive(currentOutput.interactive);
    process.on("message", msg => {
      if (typeof msg === "string" && msg.startsWith(PREFIX)) {
        const workerMessage = WorkerMessage.fromJSON(msg.substring(PREFIX.length));
        if (workerMessage.pid === process.pid) {
          return;
        }
        if (workerMessage.type === "input.received") {
          output.returnInput(workerMessage.input.uuid, workerMessage.input.value);
        }
      }
    });
    const logger = new ForkParentLogger(output);
    let exitCode = 0;
    try {
      await callback();
    } catch (err) {
      useLog("ERROR", "Fork catch", err, err.message);
      exitCode = 1;
    } finally {
      await logger.flush();
    }
    process.exit(exitCode);
  } else {
    output ??= useWorkerOutput();
    output.on("message", msg => {
      if (msg.type === "input.timeout" || msg.type === "input.received") {
        msg.pid ??= process.pid;
        try {
          child.send(PREFIX + JSON.stringify(msg));
        } catch (err) {
          output?.log("ERROR", "Failed to send message to child process", err);
        }
      }
    });
    child.on("message", async msg => {
      if (typeof msg === "string" && msg.startsWith(PREFIX)) {
        output.forwardEvent(msg.substring(PREFIX.length));
      }
    });
    child.on("error", err => {
      output?.log("ERROR", "Child process error", err);
    });
    child.on("exit", code => {
      if (code !== 0) {
        output?.log("ERROR", `Child process exited with code ${code}`);
      }
    });
    process.on("exit", () => {
      child.kill("SIGINT");
    });
    await new Promise<void>((resolve, reject) => {
      if (parentCallback) {
        parentCallback();
      }
      child.on("exit", code => {
        if (code === 0) {
          resolve();
        } else {
          reject(`Child process exited with code ${code}`);
        }
      });
    });
  }
}