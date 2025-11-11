import { Bean, Route, Service, ServiceParameters } from "@webda/core";
import { Window } from "./module";
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

/**
 * Check for the subdefinition within bean
 */
interface GoodBeanSubDefinition {
  toto: string;
  num: number;
}

class GoodBeanParameters extends ServiceParameters {
  subdefinition: GoodBeanSubDefinition;
  subdefinition2: GoodBeanSubDefinition;
}
/**
 * To verify that error are thrown when we cannot create schema
 */
@Bean
export class GoodBean extends Service<GoodBeanParameters> {
  test() {
    let w: Window = {};
    w.location = { href: "http://example.com" };
  }
}

export { LaterExportService };

/**
 * @WebdaSchema
 */
export interface SchemaTest {
  /**
   * Contact firstname
   */
  firstName: string;
  /**
   * Contact lastname
   */
  lastName: string;
  /**
   * Contact type
   */
  type: "PERSONAL" | "PROFESSIONAL";
}

/**
 * @WebdaSchema AnotherSchema
 * @SchemaAdditionalProperties You can add more properties
 */
export class SchemaTest2 {
  /**
   * Contact firstname
   */
  firstName: string;
  /**
   * Contact lastname
   */
  lastName: string;
  /**
   * Contact type
   */
  type: "PERSONAL" | "PROFESSIONAL";
  /**
   * Contact age
   *
   * @minimum 0
   */
  age: number;
  /**
   * @readOnly
   */
  uuid: string;
}

/**
 * This service is neither defined as a bean nor a modda
 * So it should just display a warning
 */
export class NoBeanNoModdaService extends Service {}
