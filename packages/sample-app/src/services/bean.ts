import { Bean, Context, Service } from "@webda/core";

@Bean
class CustomService extends Service {
  test(ctx: Context) {
    ctx.write("Tested");
  }
}
