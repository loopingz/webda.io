import { MemoryQueue, MemoryQueueParameters, Service, ServiceParameters } from "@webda/core";

/**
 * My interface type definition
 * @WebdaSchema
 */
export type MyInterface = {
  test: string;
  num: number;
};

/**
 * Simple service implementation
 * @WebdaModda
 */
export class SimpleService extends Service {}

/**
 * My interface param interface
 */
interface MyInterfaceParam {
  /**
   * Test
   */
  test: string;
}
/** Parameters for AnotherService with interface-based configuration. */
export class AnotherServiceParameters extends ServiceParameters {
  /**
   * Another parameter
   */
  anotherParameter: string;
  /**
   * The Partial will generate a new $ref
   */
  interfaceParam: Partial<MyInterfaceParam>;
}

/** Extended parameters adding a bounded numeric field for the fourth service. */
export class FourthServiceParameters extends AnotherServiceParameters {
  /**
   * Fourth parameter
   * @minimum 100
   * @maximum 1000
   */
  fourthParameter: number;
}

/**
 * Another service implementation
 * @WebdaModda
 */
export class AnotherService extends Service<AnotherServiceParameters> {}

/**
 * Second other service implementation
 * @WebdaModda
 */
export class SecondOtherService<T extends AnotherServiceParameters = AnotherServiceParameters> extends Service<T> {}

/**
 * Third other service implementation
 * @WebdaModda
 */
export class ThirdOtherService extends SimpleService {}

/**
 * Fourth other service implementation
 * @WebdaModda
 */
export class FourthOtherService<
  T extends FourthServiceParameters = FourthServiceParameters
> extends SecondOtherService<T> {}

/**
 * Queue service implementation
 * @WebdaModda
 */
export class QueueService<T extends MemoryQueueParameters = MemoryQueueParameters, K = any> extends MemoryQueue<K, T> {}
