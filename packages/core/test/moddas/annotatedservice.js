"use strict";

const Webda = require("../../lib/index.js");

@Webda.Bean
class AnnotedService extends Webda.Store {
  constructor(webda, name, params) {
    super(webda, name, params);
    webda.registerRequestFilter(this);
    if (this.parameters.brokenConstructor) throw Error();
  }

  init() {
    if (this.parameters.brokenInit) throw Error();
    this.addRoute("/broken/{type}", ["GET"], this._brokenRoute);
  }

  @Webda.Route("/route1")
  _template() {}

  @Webda.Route("/route2", ["GET", "POST"])
  _default(ctx) {}
}

module.exports = AnnotedService;
