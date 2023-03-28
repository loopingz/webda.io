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

  yop() {
    return "youpi";
  }

  canAct(ctx, action) {
    return true;
  }

  static index(ctx) {
    ctx.write("indexer");
  }

  plop(ctx) {
    ctx.write({ _plop: true });
    return Promise.resolve();
  }
}
