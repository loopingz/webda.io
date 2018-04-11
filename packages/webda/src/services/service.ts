"use strict";
import events = require('events');
import {
  Core
} from '../index';
/* beautify preserve:start */
declare var global: any;
/* beautify preserve:end */

/**
 * Use this object for representing a service in the application
 * A Service is a singleton in the application, that is init after all others services are created
 *
 * You can use a Service to create Listeners or implement shared behavior between others services
 *
 * @exports
 * @abstract
 * @class Service
 */
abstract class Service extends events.EventEmitter {

  _webda: Core;
  _name: string;
  _params: any;
  _createException: string;
  /**
   *
   *
   * @class Service
   * @param {Webda} webda - The main instance of Webda
   * @param {String} name - The name of the service
   * @param {Object} params - The parameters block define in the configuration file
   */
  constructor(webda: Core, name: string, params: any) {
    super();
    this._webda = webda;
    this._name = name;
    this._params = params;
  }

  /**
   * Convert an object to JSON using the Webda json filter
   *
   * @class Service
   * @param {Object} object - The object to export
   * @return {String} The export of the strip object ( removed all attribute with _ )
   */
  toPublicJSON(object) {
    return this._webda.toPublicJSON(object);
  }

  /**
   * Will be called after all the Services are created
   *
   * @param config for the host so you can add your own route here
   * @abstract
   */
  init(config) {

  }

  /**
   * For future use, while deploying this should be call so the service can create what it needs if necessary
   *
   * @abstract
   */
  install(params): Promise < any > {
    return Promise.resolve();
  }

  /**
   * For future use, while undeploying this should be call so the service can create what it needs if necessary
   *
   * @abstract
   */
  uninstall(params): Promise < any > {
    return Promise.resolve();
  }

  /**
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  emitSync(event, data): Promise < any[] > {
    var result;
    var promises = [];
    var listeners = this.listeners(event);
    for (var i in listeners) {
      result = listeners[i](data);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
    return Promise.all(promises);
  }

  /**
   * Listen to an event as on(...) would do except that it will be asynchronous
   * @param event
   * @param callback
   * @param queue Name of queue to use, can be undefined, queue name are used to define differents priorities
   */
  onAsync(event, callback, queue) {
    ( < any > this._webda.getService('AsyncEvents')).bindAsyncListener(this, event, callback, queue);
  }

  /**
   * Return a webda service
   * @param service name to retrieve
   */
  getService(service: string): Service {
    return this._webda.getService(service);
  }

  getTypedService < T extends Service > (service: string): T {
    return <T > this.getService(service);
  }

  /**
   * Return the Modda definition if any
   *
   */
  static getModda() {}

  getName(): string {
    return this._name;
  }

  /**
   * Clean the service data, can only be used in test mode
   *
   * @abstract
   */
  __clean(): Promise < any > {
    if (typeof(global.it) !== 'function') {
      throw Error("Only for test purpose")
    }
    return this.___cleanData();
  }

  /**
   * @private
   */
  ___cleanData(): Promise < any > {
    return Promise.resolve();
  }

  log(level, ...args) {
    this._webda.log(level, ...args);
  }
}

export {
  Service
};
