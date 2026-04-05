import { Service } from "@webda/core";

export class HawkService extends Service {
  async resolve() {
    await super.resolve();
    return this;
  }
}

export class AsyncJobService extends Service {
  async resolve() {
    await super.resolve();
    this.addRoute("/async", ["POST"], this.launchAction);
    return this;
  }
}

export class ConfigService extends Service {
  resolve(): this {
    super.resolve();
    this.addRoute("/configuration", ["GET", "PUT"], this.crudConfiguration);
    return this;
  }
}

export class TestService extends Service {
  async resolve() {
    // This should NOT be removed (argument is not 'this')
    this.getWebda().registerRequestFilter({
      checkRequest: async () => true
    });
    return this;
  }
}
