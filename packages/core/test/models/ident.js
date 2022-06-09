import { Ident as WebdaIdent } from "@webda/core";

/**
 * @class
 */
export class Ident extends WebdaIdent {
  static getActions() {
    return {
      plop: {},
      index: {
        global: true,
        methods: ["GET"]
      },
      yop: {
        methods: ["GET", "POST"]
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
