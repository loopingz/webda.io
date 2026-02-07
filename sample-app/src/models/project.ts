import { Acls, Operation as Action, OperationContext, Store } from "@webda/core";
import { Company } from "./company";
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
  acls: Acls;
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
  _company: ModelParent<Company>;
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
/*
(async () => {
  const p2 = await Project.$("test").get();
  Project.$("test").setAttribute("test", 123);

  //const p2 = await Project.ref("test").get();
  Project.$("test").patch({ test: 123 });
  p2.ref().setAttribute("n", 123);
  p2.test = new Date();
  p2.test.toISOString();
  p2.test = 123;
  p2.test2 = "test";
  p2.test.getDate();
  p2.test = 12;
  
  const project = new Project().toProxy();
  const project2 = new Project();
  project.test = new Date();
  project.test = 123;
  project.test.toISOString();
})();
*/