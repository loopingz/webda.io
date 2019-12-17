import { Context, Route, Service } from "@webda/core";

class CustomService extends Service {
  @Route("/test", ["GET"])
  test(ctx: Context) {
    console.log("Should send Tested");
    ctx.write("Tested");
  }
}
