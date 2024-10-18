import { AclModel, Action, CoreModel, ModelParent, OperationContext, Store } from "@webda/core";
import { Company } from "./company";

/**
 * This file contains several empty methods to test our auto docs
 *
 * Abstract class should not be exported as model
 */
export abstract class AbstractProject<T> extends AclModel {
  protected abstract method1(arg1: string, arg2: CoreModel, arg3: Store): Store;
}

export interface Test {
  test2: string;
}

/**
 *
 */
export interface TestDoc2 {
  n: number;
}

/**
 * @WebdaModel
 */
export class Project extends AbstractProject<TestDoc2> implements Test, TestDoc2 {
  _company: ModelParent<Company>;
  name: string;
  type: string;
  uuid: string;
  n: number;
  test2: string;
  constructor(private myparam?: string) {
    super();
  }
  /**
   * My doc
   */
  protected protectMe: {
    /**
     * Some doc
     */
    test: string;
    /**
     * Other doc
     */
    n: number;
  };

  protected method1(): Store {
    return null;
  }

  private method2(): void {}

  public method3(): { test: string; n: number } {
    return {
      test: "plop",
      n: 666
    };
  }

  union(): string | CoreModel | number {
    return 1;
  }

  test(): this & { test: string } {
    return { ...this, test: "plop" };
  }
}

export class SubProject extends Project {}

/**
 * Test of TypeParams
 */
export class AnotherSubProject<T, K extends Array<any> = any[]> extends Project {}

/**
 * Should not be added to the module as it is not exported
 */
class SubSubProject2 extends AnotherSubProject<Test, TestDoc2[]> {}

/**
 * @WebdaIgnore
 */
export class SubSubProject3 extends AnotherSubProject<Test, TestDoc2[]> {}

export class SubSubProject extends AnotherSubProject<Test, TestDoc2[]> {
  attribute1: string;
  @Action()
  action(
    context: OperationContext<{
      /**
       * My param
       */
      param: string;
    }>
  ) {}

  @Action()
  action2(context: OperationContext<Partial<Project>>) {}

  @Action()
  action3(context: OperationContext<Project>) {}

  @Action()
  action4(toto: string) {}

  @Action()
  action5<T>(context: OperationContext<T>, toto: string) {}

  @Action()
  action6<T>(context: OperationContext<string>, toto: string) {}
}
