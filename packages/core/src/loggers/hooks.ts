import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { Logger } from "./ilogger";
import { IService } from "../core/icore";
import { AbstractCoreModel } from "../models/imodel";
import { useModelId } from "../application/hook";

/**
 * Default output
 */
let output: { log: (level, ...args) => void } = console;
let workerOutput: WorkerOutput;
/**
 * Use the log function
 * @param level
 * @param args
 */
export function useLog(level: WorkerLogLevel, ...args) {
  // We should play with the async storage
  output.log(level, ...args);
}

export function setLogContext(object: { log: (level, ...args) => void }, worker: WorkerOutput) {
  output = object;
  workerOutput = worker;
}

/**
 * Return a logger for the given class
 * @param clazz
 * @returns
 */
export function useLogger(clazz: string | IService | AbstractCoreModel): Logger {
  let className = typeof clazz === "string" ? clazz : "";
  if (typeof clazz !== "string") {
    if (clazz instanceof AbstractCoreModel) {
      className = useModelId(clazz, true);
    } else {
      className = clazz.getName();
    }
    className ||= "Unknown";
  }
  return new Logger(workerOutput, className);
}
