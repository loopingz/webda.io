import { CoreModel, ModelParent, Store } from "@webda/core";
import { Company } from "./company";

/**
 * This file contains several empty methods to test our auto docs
 */
export abstract class AbstractProject<T> extends CoreModel {
  protected abstract method1(arg1: string, arg2: CoreModel, arg3: Store<CoreModel>): Store<CoreModel>;
}

export interface Test {}

/**
 * 
 */
export interface TestDoc2 {}

/**
 * @WebdaModel
 */
export class Project extends AbstractProject<TestDoc2> implements Test, TestDoc2 {
  _company: ModelParent<Company>;
  name: string;
  type: string;
  uuid: string;
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

  protected method1(): Store<CoreModel> {
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

class SubProject extends Project {
  constructor() {
    super();
  }
}

/**
 * Test of TypeParams
 */
class AnotherSubProject<T, K extends Array<any> = any[]> extends Project {
  constructor() {
    super();
  }
}

class SubSubProject extends AnotherSubProject<Test, TestDoc2[]> {
  constructor() {
    super();
  }
}
