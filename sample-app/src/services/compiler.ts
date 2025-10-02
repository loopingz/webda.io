import { MemoryQueue, MemoryQueueParameters, Service, ServiceParameters } from "@webda/core";

/**
 * @WebdaSchema
 */
export type MyInterface = {
  test: string;
  num: number;
};

/**
 * @WebdaModda
 */
export class SimpleService extends Service {}

interface MyInterfaceParam {
  test: string;
}
export class AnotherServiceParameters extends ServiceParameters {
  anotherParameter: string;
  /**
   * The Partial will generate a new $ref
   */
  interfaceParam: Partial<MyInterfaceParam>;
}

export class FourthServiceParameters extends AnotherServiceParameters {
  /**
   * @minimum 100
   * @maximum 1000
   */
  fourthParameter: number;
}

/**
 * @WebdaModda
 */
export class AnotherService extends Service<AnotherServiceParameters> {}

/**
 * @WebdaModda
 */
export class SecondOtherService<T extends AnotherServiceParameters = AnotherServiceParameters> extends Service<T> {}

/**
 * @WebdaModda
 */
export class ThirdOtherService extends SimpleService {}

/**
 * @WebdaModda
 */
export class FourthOtherService<
  T extends FourthServiceParameters = FourthServiceParameters
> extends SecondOtherService<T> {}

/**
 * @WebdaModda
 */
export class QueueService<T extends MemoryQueueParameters = MemoryQueueParameters, K = any> extends MemoryQueue<K, T> {}
