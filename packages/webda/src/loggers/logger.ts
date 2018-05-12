import {
  Service
} from '../index';

abstract class Logger extends Service {

  protected _levels: string[];
  protected _level: number;

  getDefaultLogLevels() {
    return process.env['WEBDA_LOG_LEVELS'] || this._params.logLevels || "ERROR,WARN,CONSOLE,INFO,DEBUG";
  }

  getDefaultLogLevel() {
    return process.env['WEBDA_LOG_LEVEL'] || this._params.logLevel || 'INFO';
  }

  init(params) {
    this._levels = (this.getDefaultLogLevels()).split(',').map((lvl) => lvl.trim());
    this._level = this._levels.indexOf(this.getDefaultLogLevel());
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
