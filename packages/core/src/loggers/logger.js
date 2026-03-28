import { useWorkerOutput } from "@webda/workout";
import { Service } from "../services/service.js";
/**
 * LoggerService is useful for inheritance
 */
export class LoggerService extends Service {
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
//# sourceMappingURL=logger.js.map