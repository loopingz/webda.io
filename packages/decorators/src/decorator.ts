export type AnyMethod = (...args: any[]) => any;
/**
 * Polyfill the metadata symbol to allow metadata
 */
(Symbol as any).metadata ??= Symbol.for("Symbol.metadata");

type SkipFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never;

/**
 * Get the parameters of a function, excluding the first one
 */
export type DecoratorPropertyParameters<T extends (context: ClassFieldDecoratorContext<any, any> , ...args: any[]) => any> = SkipFirst<Parameters<T>>;

/**
 * Create a method decorator than can be typed
 * It can also be called without parenthesis
 *
 * @param implementation
 * @returns
 */
export function createMethodDecorator<T extends AnyMethod, TArgs extends any[]>(
  implementation: (value: T, context: ClassMethodDecoratorContext, ...args: TArgs) => T | void
) {
  // Overloads: acts as a decorator OR as a decorator factory
  function deco(value: T, context: ClassMethodDecoratorContext): T;
  function deco(...args: TArgs): (value: T, context: ClassMethodDecoratorContext) => T;

  function deco(...all: unknown[]): any {
    // If called directly as a decorator: @deco
    if (typeof all[0] === "function" && all[1] && typeof all[1] === "object") {
      const [value, context] = all as [T, ClassMethodDecoratorContext];
      // No extra args were provided
      return implementation(value, context, ...([] as unknown as TArgs));
    }
    // Otherwise it’s a factory: @deco(...args)
    const args = all as TArgs;
    return (value: AnyMethod, context: ClassMethodDecoratorContext) => implementation(value as T, context, ...args);
  }

  return deco;
}

export type AnyCtor<T = unknown> = abstract new (...args: any[]) => T;

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

// Matches TS 5.x / TC39 "field" decorators (class properties, not accessors/methods)
export function createPropertyDecorator<TArgs extends any[], C extends ClassFieldDecoratorContext>(
  impl: (context: C, ...args: TArgs) => ((target: undefined, context: C) => void) | void
) {
  // Overloads: direct decorator OR decorator factory
  function deco(target: undefined, context: C): void;
  function deco(
    ...args: TArgs
  ): (target: undefined, context: C) => (target: undefined, context: C) => void;

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

// A handy type alias if you want parity with your other helpers
export type FieldDecorator = ReturnType<typeof createPropertyDecorator>;
export type ClassDecorator = ReturnType<typeof createClassDecorator>;
export type MethodDecorator = ReturnType<typeof createMethodDecorator>;

/**
 * Return decorator metadata
 * @param target
 * @returns
 */
export function getMetadata(target: AnyCtor): any {
  // @ts-ignore
  return target[Symbol.metadata];
}
