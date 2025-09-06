import { createMethodDecorator } from "@webda/tsc-esm";

export const WEBDA_ACTIONS: unique symbol = Symbol("Actions definition");

/**
 * An Actionable object is an object that can be converted to a DTO and back
 */
export interface Actionable<T = any> {
  [WEBDA_ACTIONS]: T;
  toDTO(): T;
  fromDTO(dto: T): void;
}

/**
 * Return attribute actions
 */
export type AttributesActions<T extends Actionable> = {
  [K in keyof T]-?: NonNullable<T[K]> extends Actionable
    ? `${Extract<K, string>}.${OwnActions<NonNullable<T[K]>>}`
    : never;
}[keyof T];

/**
 * Return object actions
 */
export type OwnActions<T extends Actionable> = {
  [K in keyof T[typeof WEBDA_ACTIONS]]: T[typeof WEBDA_ACTIONS][K] extends { disabled: true } ? never : K;
}[keyof T[typeof WEBDA_ACTIONS]] &
  string;

/**
 * Find all actions defined in a class
 *
 */
export type ActionsEnum<T extends Actionable> = AttributesActions<T> | OwnActions<T>;

/**
 * Empty class that will represent the execution context
 */
export abstract class ExecutionContext {
  /**
   * Return the current user id
   */
  abstract getCurrentUserId(): string | null;
}

/**
 * Exposable model implement the canAct
 */
export type Exposable = {
  canAct: (context: ExecutionContext, action: string) => Promise<boolean | string>;
  checkAct: (context: ExecutionContext, action: string) => Promise<void>;
} & Actionable;

/**
 * Check if a model is exposable
 * @param model
 * @returns
 */
export function isExposable(model: any): model is Exposable {
  return typeof model.canAct === "function" && isActionable(model);
}

/**
 * Check if a model is exposable
 * @param model
 * @returns
 */
export function isActionable(model: any): model is Actionable {
  return typeof model.toDTO === "function" && typeof model.fromDTO === "function";
}
const OperationRegistry = new WeakMap<object, Map<string, OperationParameters>>();

type AsyncMethod<A extends any[], R> = (...args: A) => Promise<R>;

type OperationParameters = {
  disabled?: boolean;
  name?: string;
  permissionQuery?: string;
  rest?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    path?: string;
  };
};

const Operation = createMethodDecorator(
  (value: AsyncMethod<any[], any>, context: ClassMethodDecoratorContext, options?: OperationParameters) => {
    // 1) Forbid Symbol names at decoration time
    /* v8 ignore start -- too complex to test */
    if (typeof context.name === "symbol") {
      const desc = context.name.description ?? "unknown";
      throw new TypeError(
        `@Operation cannot be applied to symbol-named methods (got Symbol(${desc})). Use a string method name.`
      );
    }
    /* v8 ignore stop */
    // Resolve a final string name for the registry
    const methodName = String(context.name);
    const effectiveOptions: OperationParameters = {
      ...options,
      name: options?.name ?? methodName
    };

    // 2) Ensure OperationRegistry is populated for both instance & static members
    //
    // For instance members, addInitializer runs for each instance; we use the prototype
    // as the WeakMap key so we only create one Map per class.
    // For static members, addInitializer runs at class evaluation with `this` = the constructor.
    context.addInitializer(function (this: any) {
      const ownerObj: object = context.static ? this : Object.getPrototypeOf(this);
      let map = OperationRegistry.get(ownerObj);
      if (!map) {
        map = new Map<string, OperationParameters>();
        OperationRegistry.set(ownerObj, map);
      }
      // Store/update this method's options
      map.set(methodName, effectiveOptions);
    });

    // Wrap the original method (logging etc.)
    const wrapped: AsyncMethod<any[], any> = function (this: any, ...args: any[]): Promise<any> {
      // optional: runtime lookup if you want access to the stored options here
      // const ownerObj = context.static ? this.constructor : Object.getPrototypeOf(this);
      // const opts = OperationRegistry.get(ownerObj)?.get(methodName);

      console.log(`Operation ${methodName} called with options:`, effectiveOptions);
      return value.apply(this, args);
    };

    return wrapped;
  }
);

export const Action = Operation;
/*
// Overloads
function Operation<A extends any[], R>(
  value: AsyncMethod<A, R>,
  context: ClassMethodDecoratorContext
): AsyncMethod<A, R>;

function Operation<T = {}>(
  options?: OperationParameters
): <A extends any[], R>(value: AsyncMethod<A, R>, context: ClassMethodDecoratorContext) => AsyncMethod<A, R>;

// Impl
function Operation<T>(...args: any[]): any {
  // Direct use: @Operation
  if (args.length === 2) {
    const [value, context] = args as [AsyncMethod<any[], any>, ClassMethodDecoratorContext];
    return createDecorator()(value, context);
  }
  // Factory use: @Operation({...})
  const [options] = args as [OperationParameters?];
  return createDecorator(options);
}

export const Action = Operation;

function createDecorator(options?: OperationParameters) {
  return function <A extends any[], R>(
    value: AsyncMethod<A, R>,
    context: ClassMethodDecoratorContext
  ): AsyncMethod<A, R> {
    // 1) Forbid Symbol names at decoration time
    if (typeof context.name === "symbol") {
      const desc = context.name.description ?? "unknown";
      throw new TypeError(
        `@Operation cannot be applied to symbol-named methods (got Symbol(${desc})). Use a string method name.`
      );
    }

    // Resolve a final string name for the registry
    const methodName = String(context.name);
    const effectiveOptions: OperationParameters = {
      ...options,
      name: options?.name ?? methodName
    };

    // 2) Ensure OperationRegistry is populated for both instance & static members
    //
    // For instance members, addInitializer runs for each instance; we use the prototype
    // as the WeakMap key so we only create one Map per class.
    // For static members, addInitializer runs at class evaluation with `this` = the constructor.
    context.addInitializer(function (this: any) {
      const ownerObj: object = context.static ? this : Object.getPrototypeOf(this);
      let map = OperationRegistry.get(ownerObj);
      if (!map) {
        map = new Map<string, OperationParameters>();
        OperationRegistry.set(ownerObj, map);
      }
      // Store/update this method's options
      map.set(methodName, effectiveOptions);
    });

    // Wrap the original method (logging etc.)
    const wrapped: AsyncMethod<A, R> = function (this: any, ...args: A): Promise<R> {
      // optional: runtime lookup if you want access to the stored options here
      // const ownerObj = context.static ? this.constructor : Object.getPrototypeOf(this);
      // const opts = OperationRegistry.get(ownerObj)?.get(methodName);

      console.log(`Operation ${methodName} called with options:`, effectiveOptions);
      return value.apply(this, args);
    };

    return wrapped;
  };
}
*/

export { Operation, OperationRegistry };
