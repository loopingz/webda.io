import {
  Service
} from '../index';

abstract class Logger extends Service {

  protected _levels: string[];
  protected _level: number;

  init(params) {
    this._levels = (this._params.levels || this._params.logLevels || "ERROR,WARN,CONSOLE,INFO,DEBUG").split(',');
    this._level = this._levels.indexOf(this._params.level || this._params.logLevel || 'INFO');
    if (this._level < 0) {
      this._level = 0;
    }
  }

  log(level, ...args): void {
    let index = this._levels.indexOf(level);
    if (index > this._level || index < 0) {
      return;
    }
    this._log(level, ...args);
  }

  abstract _log(level, ...args): void;
}

export {
  Logger
};
