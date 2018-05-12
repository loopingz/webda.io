import {
  Logger
} from '../index';

class ConsoleLogger extends Logger {

  protected _count: number = 0;

  _log(level, ...args): void {
    this._count++;
    console.log('[' + level + ']', args);
  }

  getCount() {
    return this._count;
  }

  static getModda() {
    return {
      "uuid": "Webda/ConsoleLogger",
      "label": "ConsoleLogger",
      "description": "Output all everything to the console",
      "webcomponents": [],
      "logo": "images/icons/none.png",
      "configuration": {
        "schema": {
          type: "object",
          properties: {
            "level": {
              type: "string",
              value: "INFO"
            },
            "levels": {
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
  ConsoleLogger
};
