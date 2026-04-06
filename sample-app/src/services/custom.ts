import {
  Bean,
  OperationContext,
  Operation,
  RequestFilter,
  Route,
  Service,
  ServiceParameters,
  useRouter,
  WebContext
} from "@webda/core";
import { MyInterface } from "./compiler";

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

/** Parameters for the custom service with introspection support. */
export class CustomParameters extends ServiceParameters {
  introspection: Partial<ServiceParameters>;
}

/** Demo service exposing routes and operations, also acting as a request filter. */
@Bean
export class CustomService<T extends CustomParameters = CustomParameters> extends Service<T> implements RequestFilter {
  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    useRouter().registerRequestFilter(this);
    return this;
  }

  /** Accept all incoming requests (request filter implementation). */
  async checkRequest() {
    return true;
  }

  /** Echo back the URL parameter as a formatted message. */
  @Route("/msg/{msg}", ["GET"])
  msgRoute(ctx: WebContext) {
    ctx.write(this.output(ctx.getParameters().msg));
  }

  /** Simple test route returning a fixed string. */
  @Route("/test", "GET")
  test(ctx: WebContext) {
    ctx.write("Tested");
  }

  /** Operation accepting a MyInterface payload. */
  @Operation()
  testOperation(ctx: OperationContext<MyInterface>) {}

  /** Operation with explicitly typed input and output. */
  @Operation()
  testOperationWithOutput(
    ctx: OperationContext<
      {
        test: string;
      },
      {
        result: string;
      }
    >
  ) {}

  /**
   * @MMD {seq:MyGraph} My step 1
   */
  @Route("/docs", "POST")
  autoDocs(plop: WebContext<CustomBody>) {
    plop.getRequestBody();
    const res: DefinedOutput = {
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

  /** No-op worker method. */
  work() {
    return;
  }

  /** Format a message string for output. */
  output(msg: string) {
    return `YOUR MESSAGE IS '${msg}'`;
  }

  /** Method that always throws, used to test error handling. */
  async badMethod() {
    throw new Error();
  }
}
