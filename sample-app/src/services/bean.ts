import { Bean, Cron, Operation, OperationContext, Service } from "@webda/core";

@Bean
export class BeanService extends Service {
  test() {}

  @Cron("* * * * *")
  cron() {}
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
