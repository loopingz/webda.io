import { Context, Route, Service } from "@webda/core";

class CustomService extends Service {
  @Route("/msg/{msg}", ["GET"])
  msgRoute(ctx: Context) {
    ctx.write(this.output(ctx.getParameters().msg));
  }

  @Route("/test", ["GET"])
  test(ctx: Context) {
    ctx.write("Tested");
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
