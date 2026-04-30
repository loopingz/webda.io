import { createMethodDecorator, createPropertyDecorator } from "@webda/tsc-esm";
import { truncate } from "fs/promises";

/**
 * Options accepted by `@Action()` and `@Operation()`.
 *
 * The compiler scans for these decorators by name to populate model and
 * Behavior metadata. The runtime decorator itself is a no-op pass-through —
 * its only job is to make `@Action()` a valid runtime call so the source
 * compiles. All actual action wiring is metadata-driven (see
 * `compiler/src/metadata/actions.ts` and `metadata/behaviors.ts`).
 */
export interface ActionOptions {
  /** Override the registered action name (defaults to the method name). */
  name?: string;
  /** OpenAPI overrides for the registered route. */
  openapi?: any;
  /** HTTP methods accepted by the action; defaults to `["PUT"]`. */
  methods?: string[];
  /** Mark the action as global (class-level) rather than instance-level. */
  global?: boolean;
  /**
   * Behavior-only override for the REST route registration.
   *
   *   - `route: "."` ⇒ `/<plural>/{uuid}/<attribute>` (no extra segment)
   *   - `route: "url"` ⇒ `/<plural>/{uuid}/<attribute>/url`
   *   - `route: "{hash}"` ⇒ `/<plural>/{uuid}/<attribute>/{hash}`
   *
   * `method` overrides the HTTP verb; defaults to `"PUT"` when omitted.
   */
  rest?: {
    route?: string;
    method?: string;
  };
  /** Free-form description forwarded into operation metadata. */
  description?: string;
  /** Free-form summary forwarded into operation metadata. */
  summary?: string;
}

/**
 * Marker decorator used to expose a method as a model or Behavior action.
 *
 * The body is intentionally empty. The compiler discovers `@Action`-decorated
 * methods by inspecting the AST during module generation, then writes the
 * action metadata into `webda.module.json`. At runtime the decorator simply
 * returns the method untouched, so applying or omitting it has no behavioural
 * effect on the method itself.
 *
 * Both `@Action` (no parens) and `@Action({...})` are supported.
 */
export const Action = createMethodDecorator((value: any, _context: any, _options?: ActionOptions) => value);

/**
 * Some simple annotations that can be used to add some behavior to attributes
 */
export const Masked = createPropertyDecorator((value: any, context, mask: string) => {
  if (context.kind === "field") {
    context.addInitializer(function maskedInit(this: any) {
      const descriptor = Object.getOwnPropertyDescriptor(this, context.name) || {};
      Object.defineProperty(this, context.name, {
        ...descriptor,
         
        get: function maskedGet() {
          return this[`__${context.name}`];
        },
         
        set: function maskedSet(value) {
          value = value.padEnd(mask.length, "?");
          for (let i = 0; i < mask.length; i++) {
            if (mask[i] === "X") {
              value = value.substring(0, i) + "X" + value.substring(i + 1);
            }
          }
          if (truncate) {
            value = value.substring(0, mask.length);
          }
          this[`__${context.name}`] = value;
        }
      });
    });
  }
});

export const Encrypted = createPropertyDecorator((value: any, context) => {
  if (context.kind === "field") {
    context.addInitializer(function encryptedInit(this: any) {
      const descriptor = Object.getOwnPropertyDescriptor(this, context.name) || {};
      Object.defineProperty(this, context.name, {
        ...descriptor,
         
        get: function encryptedGet() {
          const val = this[`__${context.name}`];
          if (val && val.startsWith("ENCRYPTED:")) {
            return val.substring("ENCRYPTED:".length);
          }
          return val;
        },
         
        set: function encryptedSet(value) {
          this[`__${context.name}`] = "ENCRYPTED:" + value;
        }
      });
    });
  }
});
