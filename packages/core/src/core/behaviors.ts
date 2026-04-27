import { createClassDecorator } from "@webda/decorators";

/**
 * Symbol used as the storage slot for the parent-model reference on a
 * Behavior instance. Non-enumerable so it never serializes.
 */
export const BEHAVIOR_PARENT = Symbol.for("webda.behavior.parent");

/**
 * Marker attached to a class by `@Behavior()`. Read by the compiler (at
 * build time, by inspecting the decorator AST) and the runtime (via
 * getBehaviorIdentifier / isBehaviorClass).
 */
const BEHAVIOR_MARKER = Symbol.for("webda.behavior.marker");
const BEHAVIOR_IDENTIFIER = Symbol.for("webda.behavior.identifier");

/**
 * Options accepted by the `@Behavior()` class decorator.
 */
export interface BehaviorOptions {
  /**
   * Override the auto-derived identifier (otherwise `<namespace>/<ClassName>`).
   */
  identifier?: string;
}

/**
 * Class decorator that marks a class as a Behavior — usable as the type of
 * a `CoreModel` property to expose its `@Action` methods as operations of
 * the form `<Model>.<Attribute>.<Action>`.
 *
 * Installs default `setParent`, `model`, `attribute`, and `toJSON` helpers on
 * the prototype unless the author has already defined them.
 *
 * @example
 * ```ts
 * @Behavior()
 * class MFA {
 *   @Action()
 *   verify(ctx: WebContext) { ... }
 * }
 *
 * @Behavior({ identifier: "Auth/MFA" })
 * class CustomMFA {}
 * ```
 */
export const Behavior = createClassDecorator<[BehaviorOptions?]>((cls, _ctx, options) => {
  // Marker stored on the constructor so the runtime can recognise Behavior
  // classes without holding a reference to this module.
  (cls as any)[BEHAVIOR_MARKER] = true;
  if (options?.identifier) {
    (cls as any)[BEHAVIOR_IDENTIFIER] = options.identifier;
  }

  const proto = (cls as any).prototype;

  // setParent — wires the parent-model reference. Author override wins.
  if (!Object.prototype.hasOwnProperty.call(proto, "setParent")) {
    Object.defineProperty(proto, "setParent", {
      value: function setParent(this: any, model: any, attribute: string) {
        Object.defineProperty(this, BEHAVIOR_PARENT, {
          value: { model, attribute },
          enumerable: false,
          configurable: true,
          writable: true
        });
      },
      enumerable: false,
      configurable: true,
      writable: true
    });
  }

  // model getter — returns the parent CoreModel instance.
  if (!Object.getOwnPropertyDescriptor(proto, "model")) {
    Object.defineProperty(proto, "model", {
      get(this: any) {
        return this[BEHAVIOR_PARENT]?.model;
      },
      enumerable: false,
      configurable: true
    });
  }

  // attribute getter — returns the property name on the parent.
  if (!Object.getOwnPropertyDescriptor(proto, "attribute")) {
    Object.defineProperty(proto, "attribute", {
      get(this: any) {
        return this[BEHAVIOR_PARENT]?.attribute;
      },
      enumerable: false,
      configurable: true
    });
  }

  // toJSON — returns own-enumerable data fields only. Author override wins.
  if (!Object.prototype.hasOwnProperty.call(proto, "toJSON")) {
    Object.defineProperty(proto, "toJSON", {
      value: function toJSON(this: any) {
        const out: any = {};
        for (const key of Object.keys(this)) {
          out[key] = this[key];
        }
        return out;
      },
      enumerable: false,
      configurable: true,
      writable: true
    });
  }
});

/**
 * Returns true if the given class has been decorated with `@Behavior()`.
 * @param cls Class constructor to inspect.
 * @returns `true` when the class carries the Behavior marker.
 */
export function isBehaviorClass(cls: any): boolean {
  return cls != null && cls[BEHAVIOR_MARKER] === true;
}

/**
 * Returns the explicit identifier passed to `@Behavior({ identifier })`, or
 * `undefined` if none was provided (in which case the compiler will derive
 * `<namespace>/<ClassName>`).
 * @param cls Class constructor to inspect.
 * @returns The override identifier, or `undefined` if none was set.
 */
export function getBehaviorIdentifier(cls: any): string | undefined {
  return cls?.[BEHAVIOR_IDENTIFIER];
}
