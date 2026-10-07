import { UuidModel } from "@webda/models";

/**
 * Test-only behavior used to prove vitest runs the content-mapper transform
 * @WebdaBehavior WebdaTest/Counter
 * @WebdaIgnore
 */
export class CounterBehavior {
  /** Current count */
  count: number = 0;
  /**
   * Increment the counter
   * @returns the new count
   */
  increment(): number {
    return ++this.count;
  }
}

/**
 * Test-only model holding a behavior
 * @WebdaModel WebdaTest/CounterHolder
 * @WebdaIgnore
 */
export class CounterHolder extends UuidModel {
  /** Behavior attribute */
  counter: CounterBehavior;
}
