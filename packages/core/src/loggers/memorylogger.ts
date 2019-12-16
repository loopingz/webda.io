import { ModdaDefinition } from "../core";
import { Logger } from "./logger";
interface LogEntry {
  level: string;
  args: any[];
}

/**
 * Log into memory
 * Usefull for UnitTest
 *
 * @category CoreServices
 */
class MemoryLogger extends Logger {
  _logs: LogEntry[] = [];
  _maxItems: number;

  normalizeParams() {
    super.normalizeParams();
    this._maxItems = this._params.maxItems || 1000;
  }

  _log(level, ...args): void {
    if (this._logs.length >= this._maxItems) {
      this._logs.shift();
    }
    this._logs.push({
      level: level,
      args: args
    });
  }

  getLogs(): LogEntry[] {
    return this._logs;
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/MemoryLogger",
      label: "MemoryLogger",
      description: "Keep everything in memory",
      logo: "images/icons/none.png",
      configuration: {
        schema: {
          type: "object",
          properties: {
            maxItems: {
              type: "number",
              default: 1000
            },
            logLevel: {
              type: "string",
              default: "INFO"
            },
            logLevels: {
              type: "string",
              default: "ERROR,WARN,CONSOLE,INFO,DEBUG"
            }
          }
        }
      }
    };
  }
}

export { MemoryLogger, LogEntry };
