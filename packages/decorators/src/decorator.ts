/** Any function type, used as a constraint for method decorator targets. */
export type AnyMethod = (...args: any[]) => any;

/**
 * Polyfill `Symbol.metadata` for runtimes that do not yet expose it natively.
 * TC39 decorator metadata (stage 3) stores per-class metadata under this symbol.
 * Falls back to the well-known global `Symbol.for("Symbol.metadata")` so that
 * multiple copies of this module in the same process share the same symbol.
 */
(Symbol as any).metadata ??= Symbol.for("Symbol.metadata");

/** Removes the first element from a tuple type. */
type SkipFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never;

/**
 * Extracts the extra argument types passed to a property decorator factory,
 * i.e. everything after the mandatory `context` parameter.
 *
 * @example
 * ```ts
 * const MyDeco = createPropertyDecorator(
 *   (context: ClassFieldDecoratorContext, ttl: number, label?: string) => {}
 * );
 * type Params = DecoratorPropertyParameters<typeof MyDeco>; // [ttl: number, label?: string]
 * ```
 */
export type DecoratorPropertyParameters<
  T extends (context: ClassFieldDecoratorContext<any, any>, ...args: any[]) => any
> = SkipFirst<Parameters<T>>;

/**
 * Creates a method decorator that can be applied **with or without parentheses**.
 *
 * The returned decorator is dual-mode:
 * - `@MyDecorator` — applied directly, no arguments passed to `implementation`
 * - `@MyDecorator(arg1, arg2)` — applied as a factory, arguments forwarded to `implementation`
 *
 * Detection works by checking whether the first two arguments match a TC39 decorator
 * call signature (`function` + context object). If so, it is treated as direct usage;
 * otherwise the arguments are treated as factory parameters.
 *
 * > **Note**: avoid passing a plain function as the first factory argument, as it would
 * > be indistinguishable from direct decorator usage.
 *
 * @param implementation Callback invoked when the decorator is applied.
 *   Receives `(value, context, ...args)` where `value` is the decorated method,
 *   `context` is the TC39 `ClassMethodDecoratorContext`, and `args` are the
 *   optional factory arguments.
 * @returns A dual-mode decorator function.
 *
 * @example
 * ```ts
 * const Log = createMethodDecorator(
 *   (method, context, prefix?: string) => {
 *     return function (this: any, ...args: any[]) {
 *       console.log(`${prefix ?? context.name}:`, args);
 *       return method.apply(this, args);
 *     };
 *   }
 * );
 *
 * class Api {
 *   @Log                  // direct — no arguments
 *   getUser() {}
 *
 *   @Log("fetchOrder")    // factory — with argument
 *   getOrder() {}
 * }
 * ```
 */
export function createMethodDecorator<
  T extends AnyMethod,
  C extends ClassMethodDecoratorContext<any, any>,
  TArgs extends any[]
>(
  implementation: (value: T, context: C, ...args: TArgs) => T | void
): {
  (value: T, context: C): T | void;
  (...args: TArgs): (value: T, context: C) => T | void;
} {
  // Overloads: acts as a decorator OR as a decorator factory
  function deco(value: T, context: C): T;
  function deco(...args: TArgs): (value: T, context: C) => T;

  function deco(...all: unknown[]): any {
    // If called directly as a decorator: @deco
    if (typeof all[0] === "function" && all[1] && typeof all[1] === "object") {
      const [value, context] = all as [T, C];
      // No extra args were provided
      return implementation(value, context, ...([] as unknown as TArgs));
    }
    // Otherwise it's a factory: @deco(...args)
    const args = all as TArgs;
    return (value: AnyMethod, context: C) => implementation(value as T, context, ...args);
  }

  return deco as {
    (value: T, context: C): T | void;
    (...args: TArgs): (value: T, context: C) => T | void;
  };
}

/** Any class constructor type, used as a constraint for class decorator targets. */
export type AnyCtor<T = unknown> = abstract new (...args: any[]) => T;

/**
 * Creates a class decorator that can be applied **with or without parentheses**.
 *
 * The returned decorator is dual-mode:
 * - `@MyDecorator` — applied directly, no arguments passed to `impl`
 * - `@MyDecorator(arg1, arg2)` — applied as a factory, arguments forwarded to `impl`
 *
 * Detection relies on `context.kind === "class"` to distinguish direct application
 * from factory invocation.
 *
 * @param impl Callback invoked when the decorator is applied.
 *   Receives `(value, context, ...args)` where `value` is the class constructor,
 *   `context` is the TC39 `ClassDecoratorContext`, and `args` are the optional
 *   factory arguments. May return a replacement constructor or `void`.
 * @returns A dual-mode decorator function.
 *
 * @example
 * ```ts
 * const Singleton = createClassDecorator(
 *   (cls, context, options?: { eager: boolean }) => {
 *     context.metadata["singleton"] = true;
 *   }
 * );
 *
 * @Singleton                  // direct — no arguments
 * class ServiceA {}
 *
 * @Singleton({ eager: true }) // factory — with argument
 * class ServiceB {}
 * ```
 */
export function createClassDecorator<TArgs extends any[]>(
  impl: <C extends AnyCtor>(value: C, context: ClassDecoratorContext, ...args: TArgs) => C | void
) {
  // Overloads: decorator OR decorator factory
  function deco<C extends AnyCtor>(value: C, context: ClassDecoratorContext): C | void;
  function deco(...args: TArgs): <C extends AnyCtor>(value: C, context: ClassDecoratorContext) => C | void;

  function deco(...all: unknown[]): any {
    // Direct use: @deco
    if (
      typeof all[0] === "function" &&
      all[1] &&
      typeof all[1] === "object" &&
      (all[1] as ClassDecoratorContext).kind === "class"
    ) {
      const [value, context] = all as [AnyCtor, ClassDecoratorContext];
      return impl(value, context, ...([] as unknown as TArgs));
    }
    // Factory use: @deco(...args)
    const args = all as TArgs;
    return (value: AnyCtor, context: ClassDecoratorContext) => impl(value as AnyCtor, context, ...args);
  }

  return deco as {
    <C extends AnyCtor>(value: C, context: ClassDecoratorContext): C | void;
    (...args: TArgs): <C extends AnyCtor>(value: C, context: ClassDecoratorContext) => C | void;
  };
}

/**
 * Creates a field (property) decorator that can be applied **with or without parentheses**.
 *
 * The returned decorator is dual-mode:
 * - `@MyDecorator` — applied directly, no arguments passed to `impl`
 * - `@MyDecorator(arg1, arg2)` — applied as a factory, arguments forwarded to `impl`
 *
 * Unlike method/class decorators, the TC39 field decorator receives `undefined` as its
 * first argument (the initial field value). This value is not forwarded to `impl`;
 * the implementation only receives `(context, ...args)`.
 *
 * Detection relies on `context.kind === "field"` to distinguish direct application
 * from factory invocation.
 *
 * @param impl Callback invoked when the decorator is applied.
 *   Receives `(context, ...args)` where `context` is the TC39
 *   `ClassFieldDecoratorContext` and `args` are the optional factory arguments.
 *   May return an initializer function `(initialValue) => newValue` or `void`.
 * @returns A dual-mode decorator function.
 *
 * @example
 * ```ts
 * const Expose = createPropertyDecorator(
 *   (context: ClassFieldDecoratorContext, alias?: string) => {
 *     context.metadata["expose"] ??= [];
 *     (context.metadata["expose"] as string[]).push(alias ?? String(context.name));
 *   }
 * );
 *
 * class User {
 *   @Expose              // direct — no arguments
 *   name: string;
 *
 *   @Expose("user_age") // factory — with argument
 *   age: number;
 * }
 * ```
 */
export function createPropertyDecorator<TArgs extends any[], C extends ClassFieldDecoratorContext>(
  impl: (context: C, ...args: TArgs) => ((target: undefined, context: C) => void) | void
) {
  // Overloads: direct decorator OR decorator factory
  function deco(target: undefined, context: C): void;
  function deco(...args: TArgs): (target: undefined, context: C) => (target: undefined, context: C) => void;

  function deco(...all: unknown[]): any {
    // Direct use: @deco
    // In field decorators, the second arg is a context with kind === "field"
    if (all[1] && typeof all[1] === "object" && (all[1] as C).kind === "field") {
      const [initialValue, context] = all as [undefined, C];
      // No extra args were provided in direct mode
      return impl(context, ...([] as unknown as TArgs));
    }

    // Factory use: @deco(...args)
    const args = all as TArgs;
    return (_: undefined, context: C) => {
      return impl(context, ...args);
    };
  }

  return deco as {
    (initialValue: undefined, context: C): void;
    (...args: TArgs): (initialValue: undefined, context: C) => void;
  };
}

/** Inferred return type of {@link createPropertyDecorator}. */
export type FieldDecorator = ReturnType<typeof createPropertyDecorator>;
/** Inferred return type of {@link createClassDecorator}. */
export type ClassDecorator = ReturnType<typeof createClassDecorator>;
/** Inferred return type of {@link createMethodDecorator}. */
export type MethodDecorator = ReturnType<typeof createMethodDecorator>;

/**
 * Retrieves the TC39 decorator metadata object attached to a class.
 *
 * Metadata is stored at `Class[Symbol.metadata]` and is populated automatically
 * by the TypeScript / esbuild decorator emit when any decorator accesses
 * `context.metadata`. Returns `undefined` if no decorator has written metadata
 * to the class.
 *
 * @param target The class constructor to inspect.
 * @returns The metadata object, or `undefined` if none exists.
 *
 * @example
 * ```ts
 * const info = getMetadata(MyClass);
 * const routes = info?.["webda.route"] as RouteDefinition[];
 * ```
 */
export function getMetadata(target: AnyCtor): any {
  // @ts-ignore — Symbol.metadata is stage-3; polyfilled above for older runtimes
  return target[Symbol.metadata];
}
