import { useWorkerOutput } from "@webda/workout";
import { Service } from "../services/service";
import { LoggerServiceParameters } from "./params";

/**
 * LoggerService is useful for inheritance
 */
export class LoggerService<T extends LoggerServiceParameters = LoggerServiceParameters> extends Service<T> {
    /**
     * Ensure that if addLogProducerLine is set, we set it on the output
     * @returns 
     */
    resolve() {
        if (this.parameters.addLogProducerLine) {
            useWorkerOutput().addLogProducerLine = true;
        }
        return super.resolve();
    }
}
