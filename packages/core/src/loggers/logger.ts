import { Service } from "../services/service";
import { LoggerServiceParameters } from "./params";

/**
 * LoggerService is useful for inheritance
 */
export class LoggerService<T extends LoggerServiceParameters = LoggerServiceParameters> extends Service<T> {}
