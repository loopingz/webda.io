import { Bean, Route, Service } from "@webda/core";
/**
 * @WebdaModda
 */
class LaterExportService extends Service {}

/**
 * @WebdaModda
 */
class NotExportService extends Service {}

/**
 * @WebdaModda
 */
export class NotExtendingService {}

/**
 * @WebdaDeployer
 */
export class NotExtendingDeployer {}

@Bean
export class BadBean {}

export class BadBeanFromRoute {
  @Route("/test")
  test() {}
}

export { LaterExportService };
