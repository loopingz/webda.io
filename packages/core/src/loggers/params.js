import { ServiceParameters } from "../services/serviceparameters.js";
import { useLog } from "./hooks.js";
export class LoggerServiceParameters extends ServiceParameters {
    /**
     * @inheritdoc
     */
    load(params = {}) {
        super.load(params);
        this.logLevel ?? (this.logLevel = (process.env["LOG_LEVEL"] || "INFO").toUpperCase());
        const levels = ["DEBUG", "INFO", "WARN", "ERROR", "TRACE"];
        if (!levels.includes(this.logLevel)) {
            useLog("WARN", "Invalid log level", this.logLevel, "fallback to INFO");
            this.logLevel = "INFO";
        }
        return this;
    }
}
export class MemoryLoggerServiceParameters extends LoggerServiceParameters {
}
export class ConsoleLoggerServiceParameters extends LoggerServiceParameters {
}
export class FileLoggerServiceParameters extends LoggerServiceParameters {
}
//# sourceMappingURL=params.js.map