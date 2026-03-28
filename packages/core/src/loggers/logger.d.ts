import { Service } from "../services/service.js";
import { LoggerServiceParameters } from "./params.js";
/**
 * LoggerService is useful for inheritance
 */
export declare class LoggerService<T extends LoggerServiceParameters = LoggerServiceParameters> extends Service<T> {
    /**
     * Ensure that if addLogProducerLine is set, we set it on the output
     * @returns
     */
    resolve(): this;
}
//# sourceMappingURL=logger.d.ts.map