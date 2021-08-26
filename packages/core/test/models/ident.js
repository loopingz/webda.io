"use strict";

const WebdaIdent = require("../../lib/index.js").Ident;

/**
 * @class
 */
class Ident extends WebdaIdent {
  static getActions() {
    return {
      plop: {},
      index: {
        global: true,
        method: "GET"
      },
      yop: {
        method: ["GET", "POST"]
      }
    };
  }

  _yop() {
    return "youpi";
  }

  canAct(ctx, action) {}

  static _index(ctx) {
    ctx.write("indexer");
  }

  _plop(ctx) {
    ctx.write({ _plop: true });
    return Promise.resolve();
  }
}

module.exports = Ident;
