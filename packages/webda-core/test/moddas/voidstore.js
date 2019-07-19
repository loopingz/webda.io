"use strict";

const Webda = require("../../lib/index.js");

class VoidStore extends Webda.Store {
  constructor(webda, name, params) {
    super(webda, name, params);
    webda.registerCorsFilter(this);
    if (this._params.brokenConstructor) throw Error();
  }

  init() {
    if (this._params.brokenInit) throw Error();
    this._addRoute("/broken/{type}", "GET", this._brokenRoute);
  }

  checkCSRF(context, origin, website) {
    if (
      context.getHttpContext().uri === "/bouzouf/route" &&
      context.getHttpContext().host === "csrf.com"
    ) {
      return true;
    }
    return false;
  }

  _brokenRoute(ctx) {
    if (ctx._params.type === "401") {
      throw 401;
    } else if (ctx._params.type === "Error") {
      throw new Error();
    }
  }

  exists(uid) {
    return Promise.resolve(true);
  }

  _find(request, offset, limit) {
    return Promise.resolve([]);
  }

  _save(object, uid) {
    return Promise.resolve(object);
  }

  _delete(uid) {
    return Promise.resolve();
  }

  _update(object, uid) {
    return Promise.resolve(object);
  }

  _get(uid) {
    return Promise.resolve({});
  }
}

module.exports = VoidStore;
