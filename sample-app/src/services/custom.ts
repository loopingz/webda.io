import { Context, RequestFilter, Route, Service, ServiceParameters } from "@webda/core";

interface CustomBody {
  /**
   * @TJS-test
   */
  test: string;
  optional?: string;
}

interface DefinedOutput {
  plop: boolean;
}

class CustomParameters extends ServiceParameters {
  introspection: Partial<ServiceParameters>;
}

class CustomService<T extends CustomParameters = CustomParameters> extends Service<T> implements RequestFilter {
  /**
   * @override
   */
  resolve() {
    super.resolve();
    this.getWebda().registerRequestFilter(this);
  }

  async checkRequest() {
    return true;
  }

  @Route("/msg/{msg}", ["GET"])
  msgRoute(ctx: Context) {
    ctx.write(this.output(ctx.getParameters().msg));
  }

  @Route("/test", "GET")
  test(ctx: Context) {
    ctx.write("Tested");
  }

  /**
   * @MMD {seq:MyGraph} My step 1
   */
  @Route("/docs", "POST")
  autoDocs(plop: Context<CustomBody>) {
    plop.getRequestBody();
    let res: DefinedOutput = {
      plop: true
    };
    plop.write(res);
  }

  /**
   * @MMD My step 2
   */
  autoDocs2(test: boolean = false) {
    if (test) {
      this.autoDocs3();
    } else {
      this.autoDocs4();
    }
  }

  /**
   * @MMD My step 3
   */
  autoDocs3(test: boolean = false) {
    // Do something
  }

  /**
   * @MMD My step 4
   */
  autoDocs4(test: boolean = false) {
    // Do something else
  }

  work() {
    return;
  }

  output(msg: string) {
    return `YOUR MESSAGE IS '${msg}'`;
  }

  async badMethod() {
    throw new Error();
  }
}
