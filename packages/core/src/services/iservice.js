import { State } from "@webda/utils";
import { AsyncEventEmitterImpl } from "../events/asynceventemitter.js";
/**
 * Define the service state for the application
 */
export const ServiceState = (options) => State({ error: "errored", ...options });
/**
 * Represent a Webda service
 */
export class AbstractService extends AsyncEventEmitterImpl {
    constructor(name, params) {
        super();
        this.name = name;
        this.parameters = this.constructor.createConfiguration?.(params) || params;
    }
}
//# sourceMappingURL=iservice.js.map