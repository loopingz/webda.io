import { ModdaDefinition } from "../core";
import { Logger } from "./logger";

/**
 * Log in the console
 *
 * @category CoreServices
 */
class ConsoleLogger extends Logger {
  protected _count: number = 0;

  normalizeParams() {
    super.normalizeParams();
    if (this._levels.indexOf("CONSOLE") < 0) {
      this._levels.unshift("CONSOLE");
      this._level++;
    }
  }

  _log(level, ...args: any[]): void {
    this._count++;
    if (level === "CONSOLE") {
      console.log(...args);
      return;
    }
    console.log("[" + level + "]", ...args);
  }

  getCount() {
    return this._count;
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/ConsoleLogger",
      label: "ConsoleLogger",
      description: "Output all everything to the console",
      logo: "images/icons/none.png",
      configuration: {
        schema: {
          type: "object",
          properties: {
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

export { ConsoleLogger };
