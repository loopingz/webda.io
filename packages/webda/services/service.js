"use strict";

const EventEmitter = require('events');

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
class Service extends EventEmitter {

  /**
   *
   *
   * @class Service
   * @param {Webda} webda - The main instance of Webda
   * @param {String} name - The name of the service
   * @param {Object} params - The parameters block define in the configuration file
   */
  constructor(webda, name, params) {
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
  install(params) {
  }

  /**
   * For future use, while undeploying this should be call so the service can create what it needs if necessary
   *
   * @abstract
   */
  uninstall(params) {
  }

  /**
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  emit(event, data) {
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
   * Return the Modda definition if any
   *
   */
  static getModda() {
  }

  /**
   * Clean the service data, can only be used in test mode
   *
   * @abstract
   */
  __clean() {
    if (typeof(global.it) !== 'function') {
      throw Error("Only for test purpose")
    }
    return this.___cleanData();
  }

  /**
   * @private
   */
  ___cleanData() {
    return Promise.resolve();
  }
}

module.exports = Service;