import { useLog } from "@webda/workout";
import { Logger } from "./ilogger.js";
import { AbstractService } from "../core/icore.js";
import { Model } from "@webda/models";
export { useLog };
export declare function setLogContext(object: {
    log: (level: any, ...args: any[]) => void;
}): void;
/**
 * Return a logger for the given class
 * @param clazz
 * @returns
 */
export declare function useLogger(clazz: string | AbstractService | Model): Logger;
//# sourceMappingURL=hooks.d.ts.map