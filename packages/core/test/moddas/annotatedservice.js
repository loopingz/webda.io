import { Bean, Store } from "@webda/core";

@Bean
export class AnnotedService extends Store {
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

