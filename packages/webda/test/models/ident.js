"use strict";

const CoreModel = require('../../models/coremodel');

/**
 * @class
 */
class Ident extends CoreModel {

  static getActions() {
    return {
      'plop': {},
      'index': {
        global: true,
        method: 'GET'
      },
      'yop': {
        method: ['GET', 'POST']
      }
    };
  }

  _yop() {

  }

  canAct(ctx, action) {

  }

  static _index(ctx) {
    ctx.write('indexer');
  }

  _plop(ctx) {
    this._plop = true;
    ctx.write(this);
    return Promise.resolve();
  }
}

module.exports = Ident
