import { ResourceAcl, Operation as Action, OperationContext, Store } from "@webda/core";
import type { Company } from "./company";
import { Model, ModelParent, WEBDA_PRIMARY_KEY } from "@webda/models";

/** Base model providing proxy and authorization stubs for the sample app. */
abstract class CoreModel extends Model {
  /**
   * Injected by Webda framework
   */
  // static $(key: string): ModelRefWithCreate<any> {
  //   return undefined;
  // }

  /**
   * Return a proxy wrapper for this model (identity by default).
   *
   * @returns the proxy
   */
  toProxy(): any {
    return this;
  }

  /**
   * Check whether the given action is permitted (always returns true).
   *
   * @param action - the action to check
   * @param context - optional context
   * @returns true
   */
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

  /**
   * Abstract method implementation returning null (test stub).
   *
   * @returns null
   */
  protected method1(): Store {
    return null;
  }

  /** Private no-op method for testing visibility handling. */
  private method2(): void {}

  /**
   * Return a hardcoded test object.
   *
   * @returns a test object
   */
  public method3(): { test: string; n: number } {
    return {
      test: "plop",
      n: 666
    };
  }

  /**
   * Return a union-typed value for testing schema generation.
   *
   * @returns a union-typed value
   */
  union(): string | CoreModel | number {
    return 1;
  }
}

/** Subclass of Project with no additional fields, used for inheritance testing. */
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

/** Concrete sub-sub-project with custom actions for testing action exposure. */
export class SubSubProject extends AnotherSubProject<Test, TestDoc2[]> {
  attribute1: string;
  /**
   * Sample action taking a string parameter.
   *
   * @param param - the action parameter
   */
  @Action()
  action(
    /**
     * My param
     */
    param: string
  ) {}

  /**
   * Action accepting a partial project payload.
   *
   * @param project - partial project data
   */
  @Action()
  action2(project: Partial<Project>) {}

  /**
   * Action accepting a full project payload.
   *
   * @param project - project data
   */
  @Action()
  action3(project: Project) {}

  /**
   * Action accepting a string argument.
   *
   * @param toto - string argument
   */
  @Action()
  action4(toto: string) {}
}
