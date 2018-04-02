"use strict";

const WebdaIdent = require("../../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js").Ident;

/**
 * @class
 */
class Ident extends WebdaIdent {

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
