import { FileQueue, FileQueueParameters, Service, ServiceParameters } from "@webda/core";

/**
 * @WebdaModda
 */
export class SimpleService extends Service {}

class AnotherServiceParameters extends ServiceParameters {
  anotherParameter: string;
}

class FourthServiceParameters extends AnotherServiceParameters {
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
export class QueueService<T extends FileQueueParameters = FileQueueParameters, K = any> extends FileQueue<K, T> {}
