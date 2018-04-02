"use strict";

const Webda = require("../../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");

class VoidStore extends Webda.Store {

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
