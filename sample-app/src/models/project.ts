import { ResourceAcl, Operation as Action, OperationContext, Store } from "@webda/core";
import type { Company } from "./company";
import { Model, ModelParent, WEBDA_PRIMARY_KEY } from "@webda/models";

abstract class CoreModel extends Model {
  /**
   * Injected by Webda framework
   * @param key
   * @returns
   */
  // static $(key: string): ModelRefWithCreate<any> {
  //   return undefined;
  // }

  toProxy(): any {
    return this;
  }

  async canAct(action: string, context?: any): Promise<boolean> {
    return true;
  }
}
/**
 * This file contains several empty methods to test our auto docs
 *
 * Abstract class should not be exported as model
 */
export abstract class AbstractProject<T> extends CoreModel {
  acls: ResourceAcl;
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
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  company: ModelParent<Company>;
  name: string;
  type: string;
  uuid: string;
  n: number;
  test2: string;
  test: Date;
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
    /**
     * My param
     */
    param: string
  ) {}

  @Action()
  action2(project: Partial<Project>) {}

  @Action()
  action3(project: Project) {}

  @Action()
  action4(toto: string) {}
}
