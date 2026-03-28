import { WorkerOutput, useLog } from "@webda/workout";
import { Logger } from "./ilogger.js";
import { Model } from "@webda/models";
import { useModelId } from "../application/hooks.js";
/**
 * Default output
 */
let output = console;
let workerOutput;
export { useLog };
export function setLogContext(object) {
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
export function useLogger(clazz) {
    let className = typeof clazz === "string" ? clazz : "";
    if (typeof clazz !== "string") {
        if (clazz instanceof Model) {
            className = useModelId(clazz);
        }
        else {
            className = clazz.getName();
        }
        className || (className = "Unknown");
    }
    return new Logger(workerOutput, { class: className });
}
//# sourceMappingURL=hooks.js.map