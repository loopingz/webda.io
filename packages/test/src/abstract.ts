/* eslint-disable */
/**
 * The abstract class ClassTestUI ...
 *
 * Mostly copied from: https://github.com/testdeck/testdeck/blob/main/packages/core/index.ts
 * From @testdeck/core
 */
export abstract class ClassTestUI {
  /**
   * This symbol can be used to get the `this` context passed to `describe` and `it` in test runner frameworks.
   * Test classes and instances will have the context assigned using this key.
   */
  public readonly executeAfterHooksInReverseOrder: boolean = false;

  public readonly runner: TestRunner;

  public readonly suite: SuiteDecorator;
  public readonly test: TestDecorator;

  public readonly slow: ExecutionOptionDecorator;
  public readonly timeout: ExecutionOptionDecorator;
  public readonly retries: ExecutionOptionDecorator;

  public readonly pending: ExecutionModifierDecorator;
  public readonly only: ExecutionModifierDecorator;
  public readonly skip: ExecutionModifierDecorator;

  public readonly params: ParameterisedTestDecorator;

  public constructor(runner: TestRunner) {
    this.runner = runner;

    this.suite = this.makeSuiteObject();
    this.test = this.makeTestObject();
    this.params = this.makeParamsObject();

    this.slow = this.createExecutionOption("slow");
    this.timeout = this.createExecutionOption("timeout");
    this.retries = this.createExecutionOption("retries");

    this.pending = this.createExecutionModifier("pending");
    this.only = this.createExecutionModifier("only");
    this.skip = this.createExecutionModifier("skip");
  }

  /**
   * Declares the provided function as decorator.
   * Used to mark decorators such as `@timeout` that can sometimes be provided as single argument to `@suite(timeout(1000))`.
   * In those cases the `suite()` overload should be able to distinguish the timeout function from class constructor.
   */
  protected markAsDecorator<Arg extends ClassDecorator | SuiteDecorator>(arg: Arg): Arg {
    arg[`__weba_isDecorator`] = true;
    return arg;
  }

  private getSettings(obj: any): LifecycleSettings | TestSettings | SuiteSettings {
    let settings;
    if ("__webda_slow" in obj) {
      (settings || (settings = {})).slow = obj["__webda_slow"];
    }
    if ("__webda_timeout" in obj) {
      (settings || (settings = {})).timeout = obj["__webda_timeout"];
    }
    if ("__webda_retries" in obj) {
      (settings || (settings = {})).retries = obj["__webda_retries"];
    }
    if ("__webda_execution" in obj) {
      (settings || (settings = {})).execution = obj["__webda_execution"];
    }
    return settings;
  }

  protected suiteCallbackFromClass<T extends TestInstance>(constructor: TestClass<T>): () => void {
    return () => {
      const ThisTestUI = this;
      // Regiter the static before method of the class to be called before-all tests.
      if (constructor.before) {
        this.runner.beforeAll(function () {
          return constructor.before();
        }, this.getSettings(constructor.before));
      }

      let instance;
      const prototype = constructor.prototype;
      // Register the instance before method to be called before-each test method.
      this.runner.beforeEach(
        async function () {
          constructor.prototype["__webda_context"] = ThisTestUI;
          instance = new constructor();
          constructor.prototype["__webda_context"] = undefined;
          if (prototype.before) {
            await instance.before();
          }
        },
        prototype.before ? this.getSettings(prototype.before) : {}
      );

      // All suite before/after each/all calls and instantiation have been set in place.
      // Now collect all potential test methods and declare them in the underlying test framework.
      const collectedTests: { [key: string]: any[] } = {};
      let currentPrototype = prototype;
      while (currentPrototype !== Object.prototype) {
        Object.getOwnPropertyNames(currentPrototype).forEach(key => {
          const descriptor = Object.getOwnPropertyDescriptor(currentPrototype, key);
          if (typeof descriptor.value === "function" && descriptor.value["__webda_name"] && !collectedTests[key]) {
            collectedTests[key] = [prototype, descriptor.value];
          }
        });
        currentPrototype = (Object as any).getPrototypeOf(currentPrototype);
      }

      // run all collected tests
      for (const key in collectedTests) {
        // Removed parameters feature for now
        const [_prototype, method] = collectedTests[key];
        this.runner.test(
          method["__webda_name"],
          function () {
            method.bind(instance);
            return instance["testWrapper"] ? instance["testWrapper"](method) : method();
          },
          { ...this.getSettings(method), instance }
        );
      }

      this.runner.afterEach(
        async function teardownInstance() {
          // Register the instance after method to be called after-each test method.
          if (prototype.after) {
            await instance.after();
          }
          instance = null;
        },
        prototype.after ? this.getSettings(prototype.after) : {}
      );

      // Register the static after method of the class to be called after-all tests.
      if (constructor.after) {
        this.runner.afterAll(async function () {
          await constructor.after();
        }, this.getSettings(constructor.after));
      }
    };
  }

  private makeSuiteObject(): SuiteDecorator {
    return Object.assign(this.makeSuiteFunction(), {
      skip: this.makeSuiteFunction("skip"),
      only: this.makeSuiteFunction("only"),
      pending: this.makeSuiteFunction("pending")
    });
  }

  private makeSuiteFunction(execution?: Execution): SuiteDecoratorOrName {
    const theTestUI = this;
    const decorator = function () {
      // Used as `@suite() class MySuite {}`
      if (arguments.length === 0) {
        return decorator;
      }

      // Used as `@suite class MySuite {}`
      if (arguments.length === 1 && typeof arguments[0] === "function" && !arguments[0]["__webda_isDecorator"]) {
        const ctor = arguments[0];
        applySuiteDecorator(ctor.name, ctor);
        return;
      }

      // Used as `@suite("name", timeout(1000))`, return a decorator function,
      // that when applied to a class will first apply the execution symbol and timeout decorators, and then register the class as suite.
      const hasName = typeof arguments[0] === "string";
      const name: string = hasName ? arguments[0] : undefined;
      const decorators: ClassDecorator[] = [];
      for (let i = hasName ? 1 : 0; i < arguments.length; i++) {
        decorators.push(arguments[i]);
      }

      return function (ctor) {
        for (const decorator of decorators) {
          decorator(ctor);
        }
        applySuiteDecorator(hasName ? name : ctor.name, ctor);
      };

      function applySuiteDecorator(name: string, ctor) {
        if (ctor["__webda_suite"]) {
          throw new Error(
            `@suite ${ctor.name} can not subclass another @suite class, use abstract base class instead.`
          );
        }
        ctor["__webda_suite"] = true;
        if (execution) {
          ctor["__webda_execution"] = execution;
        }
        ctor["__webda_suite_name"] = name || ctor.name;
        ctor.prototype["__webda_suite_name"] = ctor["__webda_suite_name"];
        theTestUI.runner.suite(name, theTestUI.suiteCallbackFromClass(ctor), theTestUI.getSettings(ctor));
      }
    };

    // TODO: figure out why the interface SuiteDecoratorOrName cannot be returned here,
    // for now we will just cast to any to make the compiler happy
    return decorator as any;
  }

  static getInfo(object: any) {
    return {
      slow: object["__webda_slow"],
      timeout: object["__webda_timeout"],
      retries: object["__webda_retries"],
      execution: object["__webda_execution"],
      name: object["__webda_name"],
      suite: object["__webda_suite"]
    };
  }

  // Things regarding test, abstract in a separate class...
  private makeTestObject(): TestDecorator {
    return Object.assign(this.makeTestFunction(), {
      skip: this.makeTestFunction("skip"),
      only: this.makeTestFunction("only"),
      pending: this.makeTestFunction("pending")
    });
  }

  private makeTestFunction(execution?: Execution) {
    return this.testOverload({
      testProperty(target: Object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void {
        target[propertyKey]["__webda_name"] = propertyKey.toString();
        if (execution) {
          target[propertyKey]["__webda_execution"] = execution;
        }
      },
      testDecorator(...decorators: MethodDecorator[]): PropertyDecorator & MethodDecorator {
        return function (target: Object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void {
          target[propertyKey]["__webda_name"] = propertyKey.toString();
          for (const decorator of decorators) {
            decorator(target, propertyKey, descriptor);
          }
          if (execution) {
            target[propertyKey]["__webda_execution"] = execution;
          }
        };
      },
      testDecoratorNamed(name: string, ...decorators: MethodDecorator[]): PropertyDecorator & MethodDecorator {
        return function (target: Object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void {
          target[propertyKey]["__webda_name"] = name;
          for (const decorator of decorators) {
            decorator(target, propertyKey, descriptor);
          }
          if (execution) {
            target[propertyKey]["__webda_execution"] = execution;
          }
        };
      }
    });
  }

  private testOverload({
    testProperty,
    testDecorator,
    testDecoratorNamed
  }: {
    testProperty(target: Object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void;
    testDecorator(...decorators: MethodDecorator[]): MethodDecorator;
    testDecoratorNamed(name: string, ...decorators: MethodDecorator[]): MethodDecorator;
  }) {
    return function () {
      const args = [];
      for (let idx = 0; idx < arguments.length; idx++) {
        args[idx] = arguments[idx];
      }

      if (arguments.length >= 2 && typeof arguments[0] !== "string" && typeof arguments[0] !== "function") {
        return testProperty.apply(this, args);
      } else if (arguments.length >= 1 && typeof arguments[0] === "string") {
        return testDecoratorNamed.apply(this, args);
      } else {
        return testDecorator.apply(this, args);
      }
    };
  }

  private makeParamsFunction(execution?: Execution) {
    return function (params: any, name?: string) {
      return function (target: Object, propertyKey: string) {
        target[propertyKey]["__webda_name"] = propertyKey.toString();
        target[propertyKey]["__webda_parametersSymbol"] = target[propertyKey]["__webda_parametersSymbol"] || [];
        target[propertyKey]["__webda_parametersSymbol"].push({ execution, name, params } as TestParams);
      };
    };
  }

  private makeParamsNameFunction() {
    return (nameForParameters: (parameters: any) => string) => {
      return (target: Object, propertyKey: string) => {
        target[propertyKey]["__webda_nameForParameters"] = nameForParameters;
      };
    };
  }

  private makeParamsObject() {
    return Object.assign(this.makeParamsFunction(), {
      skip: this.makeParamsFunction("skip"),
      only: this.makeParamsFunction("only"),
      pending: this.makeParamsFunction("pending"),
      naming: this.makeParamsNameFunction()
    });
  }

  /**
   * Create execution options such as `@slow`, `@timeout` and `@retries`.
   */
  private createExecutionOption(key: symbol | string): ExecutionOptionDecorator {
    const classTestUIInstance = this;
    return function (value: number): ClassDecorator & MethodDecorator {
      return classTestUIInstance.markAsDecorator(function () {
        if (arguments.length === 1) {
          const target = arguments[0];
          target[key] = value;
        } else {
          const proto = arguments[0];
          const prop = arguments[1];
          const descriptor = arguments[2];
          proto[prop][key] = value;
        }
      });
    };
  }

  /**
   * Creates the decorators `@pending`, `@only`, `@skip`.
   */
  private createExecutionModifier(execution: Execution): ExecutionModifierDecorator {
    // <T>(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void
    const decorator = function <T>(
      target: Function | boolean | Object,
      propertyKey?: string | symbol,
      descriptor?: TypedPropertyDescriptor<T>
    ): any {
      if (typeof target === "undefined" || typeof target === "boolean") {
        if (target) {
          return decorator;
        } else {
          return () => {};
        }
      }
      if (arguments.length === 1) {
        target["__webda_execution"] = execution;
      } else {
        target[propertyKey]["__webda_execution"] = execution;
      }
    };
    return decorator as any;
  }
}

/**
 * Some frameworks pass `this` as context to `describe` and `it`,
 * its type is irrelevant here, but the type here will be used,
 * where the `this` test or suite context was expected to be passed down.
 */
export type FrameworkContext = any;

export type Done = (err?: any) => void;
export type SuiteCallback = (this: FrameworkContext) => void;
export type CallbackOptionallyAsync = (this: FrameworkContext, done?: Done) => void | Promise<void>;

export interface SuiteDecoratorOrName extends ClassDecorator {
  /**
   * Callable with optional name, followed by decorators. Allows:
   * ```
   * @suite
   * @timeout(1000)
   * @slow(500)
   * ```
   * To condensed on a single line:
   * ```
   * @suite(timeout(1000), slow(500))
   * ```
   * Please note the pit fall in the first case - the `@suite` must be the first decorator.
   */
  (name: string, ...decorators: ClassDecorator[]): ClassDecorator;
  /**
   * Called with decorators only, such as:
   * ```
   * @suite(timeout(1000), slow(500))
   * ```
   */
  (...decorator: ClassDecorator[]): ClassDecorator;
  /**
   * Called with with no arguments, e.g.
   * ```
   * @suite()
   * ```
   */
  // (): SuiteDecoratorOrName;
}

export interface SuiteDecorator extends SuiteDecoratorOrName {
  only: SuiteDecoratorOrName;
  skip: SuiteDecoratorOrName;
  pending: SuiteDecoratorOrName;
}

export interface TestDecoratorOrName extends MethodDecorator {
  /**
   * Callable with optional name, followed by decorators. Allows:
   * ```
   * @test
   * @timeout(1000)
   * @slow(500)
   * ```
   * To condensed on a single line:
   * ```
   * @test(timeout(1000), slow(500))
   * ```
   * Please note the pit fall in the first case - the `@test` must be the first decorator.
   */
  (name: string, ...decorator: MethodDecorator[]): MethodDecorator;
  /**
   * Called as:
   * ```
   * @test(timeout(1000), slow(500))
   * ```
   */
  (...decorator: MethodDecorator[]): MethodDecorator;
}

/**
 * The type of the `@test` decorator.
 * The decorator can be used as: `@test`, `@test()`, `@test("name")`, `@test.only`, `@test.only()`, `@test.only("name")`, etc.
 */
export interface TestDecorator extends TestDecoratorOrName {
  only: TestDecoratorOrName;
  skip: TestDecoratorOrName;
  pending: TestDecoratorOrName;
}

/**
 * See: https://github.com/testdeck/testdeck/issues/292
 * Basically the mocha [context] symbol extends Object and somehow the TypeScript typechecking
 * become strict enough to discard Object as source for the target: Object,
 * so we are now using the escape hatch - any for target type.
 */
declare type RelaxedMethodDecorator = <T>(
  target: any,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>
) => TypedPropertyDescriptor<T> | void;

/**
 * After a `@suite` or `@test`,
 * these decortors can be used as `@slow(1000)`, `@timeout(2000)` and `@retries(3)`.
 * These can also be used as traits - such as `@suite(timeout(2000))`.
 */
export type ExecutionOptionDecorator = (value: number) => ClassDecorator & MethodDecorator & RelaxedMethodDecorator;

/**
 * An execution modifier decorators. Used to control which tests will be executed on test-run.
 * Decorators can be used as `@pending`, `@only` and `@skip`.
 * Or with condition: `@only(isWindows)`.
 */
export interface ExecutionModifierDecorator extends ClassDecorator, MethodDecorator {
  (condition: boolean): ClassDecorator & MethodDecorator;
}

export interface ParameterisedTestDecorator {
  (params: any, name?: string): MethodDecorator;
  skip(params: any, name?: string): MethodDecorator;
  only(params: any, name?: string): MethodDecorator;
  pending(params: any, name?: string): MethodDecorator;
  naming(nameForParameters: (params: any) => string): MethodDecorator;
}

export interface TestInstance {
  /**
   * An instance method, that if defined, is executed before every test method.
   */
  before?(done?: Done): void | Promise<void>;

  /**
   * An instance method, that if defined, is executed after every test method.
   */
  after?(done?: Done): void | Promise<void>;
}

export interface TestClass<T extends TestInstance> {
  new (...args: any[]): T;
  prototype: T;

  /**
   * A static method, that if defined, is executed once, before all test methods.
   */
  before?(done?: Done): void | Promise<void>;

  /**
   * A static method, that if defined, is executed once, after all test methods.
   */
  after?(done?: Done): void | Promise<void>;
}

export interface DependencyInjectionSystem {
  handles<T extends TestInstance>(cls: TestClass<T>): boolean;
  create<T extends TestInstance>(cls: TestClass<T>): T;
}

/**
 * Test or suite execution.
 * The `undefined` means execute as normal.
 */
export type Execution = undefined | "pending" | "only" | "skip";

interface TestParams {
  execution?: Execution;
  name?: string;
  params: any;
}

export interface SuiteSettings {
  execution?: Execution;
  timeout?: number;
  slow?: number;
  retries?: number;
}

export interface TestSettings {
  execution?: Execution;
  timeout?: number;
  slow?: number;
  retries?: number;
  instance?: any;
}

export interface LifecycleSettings {
  timeout?: number;
  slow?: number;
}

/**
 * An adapter for a test runner that is used by the class syntax decorators based test ui.
 *
 * For example the test:
 * ```TypeScript
 * @suite class MyClass {
 *     @test myTest() {
 *     }
 * }
 * ```
 * Will call declareSuite with the name "MyClass" and a cb.
 * When that cb is called it will further call declareTest with the "myTest" name and a test function.
 * The test function when called will instantiate MyClass and call the myTest on that instance.
 */
export interface TestRunner {
  suite(name: string, callback: SuiteCallback, settings?: SuiteSettings): void;
  test(name: string, callback: CallbackOptionallyAsync, settings?: TestSettings): void;

  beforeAll(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void;
  beforeEach(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void;
  afterEach(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void;
  afterAll(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void;
}
