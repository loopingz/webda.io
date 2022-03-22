import { Bean, Cron, Service } from "@webda/core";

@Bean
class BeanService extends Service {
  test() {}

  @Cron("* * * * *")
  cron() {}
}

@Bean
class SampleAppBadBean {}
