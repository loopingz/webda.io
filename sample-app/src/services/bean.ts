import { Bean, Cron, OperationContext, Service } from "@webda/core";
import { Operation } from "@webda/models";

@Bean
export class BeanService extends Service {
  test() {}

  @Cron("* * * * *")
  async cron() {}
}

@Bean
export class SampleAppBadBean {
  @Operation()
  operation(context: OperationContext<{ projectId: string }>) {}

  async stop() {}
}

@Bean
export class SampleAppGoodBean extends BeanService {
  @Operation()
  operation(context: OperationContext<{ projectId: string }>) {}
  @Operation()
  operation2(context: OperationContext) {}
}
