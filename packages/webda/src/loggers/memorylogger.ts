import {
  Logger
} from '../index';

interface LogEntry {
  level: string,
    args: any[]
}

class MemoryLogger extends Logger {
  _logs: LogEntry[] = [];
  _maxItems: number;

  async init(params): Promise < void > {
    await super.init(params);
    this._maxItems = this._params.maxItems || 1000;
  }

  _log(level, ...args): void {
    if (this._logs.length >= this._maxItems) {
      this._logs.shift();
    }
    this._logs.push({
      "level": level,
      "args": args
    });
  }

  getLogs(): LogEntry[] {
    return this._logs;
  }

  static getModda() {
    return {
      "uuid": "Webda/MemoryLogger",
      "label": "MemoryLogger",
      "description": "Keep everything in memory",
      "webcomponents": [],
      "logo": "images/icons/none.png",
      "configuration": {
        "schema": {
          type: "object",
          properties: {
            "maxItems": {
              type: "number",
              value: 1000
            },
            "logLevel": {
              type: "string",
              value: "INFO"
            },
            "logLevels": {
              type: "string",
              value: "ERROR,WARN,CONSOLE,INFO,DEBUG"
            }
          }
        }
      }
    }
  }
}

export {
  MemoryLogger,
  LogEntry
};
