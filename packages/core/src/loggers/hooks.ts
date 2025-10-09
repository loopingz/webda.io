import { WorkerOutput, useLog } from "@webda/workout";
import { Logger } from "./ilogger.js";
import { AbstractService } from "../core/icore.js";
import { Model } from "@webda/models";
import { useModelId } from "../application/hooks.js";

/**
 * Default output
 */
let output: { log: (level, ...args) => void } = console;
let workerOutput: WorkerOutput;

export { useLog };

export function setLogContext(object: { log: (level, ...args) => void }) {
  output = object;
  if (output instanceof WorkerOutput) {
    workerOutput = output;
  }
}

/**
 * Return a logger for the given class
 * @param clazz
 * @returns
 */
export function useLogger(clazz: string | AbstractService | Model): Logger {
  let className = typeof clazz === "string" ? clazz : "";
  if (typeof clazz !== "string") {
    if (clazz instanceof Model) {
      className = useModelId(clazz);
    } else {
      className = clazz.getName();
    }
    className ||= "Unknown";
  }
  return new Logger(workerOutput, { class: className });
}
