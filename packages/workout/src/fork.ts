import { ChildProcess, fork } from "node:child_process";
import { useLog, useWorkerOutput, WorkerMessage, WorkerMessageType, WorkerOutput } from "./core";
import { WorkerLogger } from "./loggers/index";

const PREFIX = "ForkParentLogger:";

/**
 * Logger that forwards all messages to the parent process via IPC
 * Used internally by Fork() to enable logging from forked child processes
 */
export class ForkParentLogger extends WorkerLogger {
  /** Number of pending messages being sent to parent process */
  pending: number = 0;

  /**
   * Send a log message to the parent process via process.send()
   * @param msg - The message to forward to the parent process
   */
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

  /**
   * Wait for all pending messages to be sent to the parent process
   * @param timeout - Maximum time to wait in milliseconds (default: 30000)
   * @returns Promise that resolves when all messages are sent or rejects on timeout
   */
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

/**
 * Launch a forked process to run the callback
 * Automatically forwards all logging and progress events between parent and child processes
 *
 * @param callback - Function to run in the forked child process
 * @param parentCallback - Optional function to run in the parent process while child executes
 * @param output - Optional WorkerOutput instance for logging (defaults to global instance)
 * @returns Promise that resolves when the child process exits with code 0, rejects otherwise
 *
 * @example
 * ```ts
 * import { Fork } from "@webda/workout";
 * 
 * await Fork(async () => {
 *   // This code runs in the forked process
 *   useLog("Hello from the forked process");
 *   useWorkerOutput().startActivity("Test");
 *   await new Promise(resolve => setTimeout(resolve, 2000));
 *   useWorkerOutput().stopActivity("Test");
 * }, () => {
 *   // This code runs in the parent process
 *   useLog("Hello from the parent process");
 * });
 * ```
 */
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