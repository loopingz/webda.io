import {
  Bean,
  Context,
  Operation,
  OperationContext,
  RequestFilter,
  Route,
  Service,
  ServiceParameters
} from "@webda/core";

/**
 * @WebdaSchema testInput
 */
export interface CustomBody {
  /**
   * @TJS-test
   */
  test: string;
  optional?: string;
}

/**
 * @WebdaSchema testOutput
 */
export interface CustomBody {
  /**
   * @TJS-test
   */
  result: string;
}

interface DefinedOutput {
  plop: boolean;
}

class CustomParameters extends ServiceParameters {
  introspection: Partial<ServiceParameters>;
}

@Bean
class CustomService<T extends CustomParameters = CustomParameters> extends Service<T> implements RequestFilter {
  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    this.getWebda().registerRequestFilter(this);
    return this;
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

  @Operation("testOperation", "testInput")
  testOperation(ctx: OperationContext) {}

  @Operation("testOperationWithOutput", "testInput", "testOutput")
  testOperation2(ctx: OperationContext) {}
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
