import { Context, Route, Service } from "@webda/core";

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
class CustomService extends Service {
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
  autoDocs(plop: Context) {
    plop.getRequestBody<CustomBody>();
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
