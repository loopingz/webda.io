import { Context, Route, Service } from "@webda/core";

class CustomService extends Service {
  @Route("/test", ["GET"])
  test(ctx: Context) {
    ctx.write("Tested");
  }
}
