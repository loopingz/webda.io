import { ChildProcess, fork } from "node:child_process";
import { useLog, useWorkerOutput, WorkerMessage, WorkerMessageType, WorkerOutput } from "./core";
import { WorkerLogger } from "./loggers/index";

const PREFIX = "ForkParentLogger:";

export class ForkParentLogger extends WorkerLogger {
  onMessage(msg: WorkerMessage): void {
    process.send("ForkParentLogger: " + JSON.stringify(msg));
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
    new ForkParentLogger(output);
    try {
      await callback();
    } catch (err) {
      useLog("ERROR", "Fork catch", err, err.message);
      process.exit(1);
    }
    process.exit(0);
  } else {
    output ??= useWorkerOutput();
    output.on("message", msg => {
      if (msg.type === "input.timeout" || msg.type === "input.received") {
        msg.pid ??= process.pid;
        child.send(PREFIX + JSON.stringify(msg));
      }
    });
    child.on("message", async msg => {
      if (typeof msg === "string" && msg.startsWith(PREFIX)) {
        output.forwardEvent(msg.substring(PREFIX.length));
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

export class Forker {
  constructor() {
    process.on("message", msg => {
      console.log("Forker: " + JSON.stringify(msg));
    });
  }

  send(msg: WorkerMessage) {
    process.send(msg);
  }
}
