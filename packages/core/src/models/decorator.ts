import { createMethodDecorator, createPropertyDecorator } from "@webda/decorators";

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
   * REST URI template and HTTP verb. Instance actions implicitly include the model primary key.
   *
   *   - `route: "."` ⇒ `/<plural>/{uuid}/<attribute>` (no extra segment)
   *   - `route: "url"` ⇒ `/<plural>/{uuid}/<attribute>/url`
   *   - `route: "{hash}"` ⇒ `/<plural>/{uuid}/<attribute>/{hash}`
   *
   * `method` overrides the HTTP verb; defaults to `"PUT"` when omitted.
   */
  rest?: {
    /** URI template relative to the model collection (or behavior attribute). */
    path?: string;
    /** Use the whole JSON body as this method parameter. */
    body?: string;
    route?: string;
    method?: string;
  };
  /** Free-form description forwarded into operation metadata. */
  description?: string;
  /** Free-form summary forwarded into operation metadata. */
  summary?: string;
  /**
   * Require the second factor to be verified within this duration (Duration syntax: `600`, `"10m"`), see
   * `OperationDefinition.maxMfaAge`. Read by the compiler: use a string or number literal
   */
  maxMfaAge?: number | string;
  /**
   * Feature flag gating the operation. When the flag is off for the caller
   * the operation answers NotFound and is left out of listings.
   * `true` uses the operation id as flag name.
   */
  featureFlag?: string | true;
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
 * Marker decorator for a model method shared with the frontend SDK (`@webda/sdk`)
 *
 * The runtime decorator is a no-op; the compiler copies the method's source into `ModelMetadata.Shared` and the SDK
 * generator inlines it into the generated model class, so the method runs identically on both sides. The compiler
 * enforces that the body is pure: it may only use its parameters, `this.<attribute>`, `this.<other @Shared method>`,
 * `<Model>.<static @Shared method>`, the standard globals (`Date`, `Math`, `JSON`, `Array`...) and identifiers imported
 * from the allowlisted modules (`sharedImports`, `@webda/utils` and `@webda/ql` by default). Anything else fails the
 * build.
 *
 * ```ts
 * @Shared()
 * isOverdue(now: Date = new Date()): boolean {
 *   return this.status === "open" && this.due < now;
 * }
 * ```
 */
export const Shared = createMethodDecorator((value: any, _context: any) => value);

/** Decorator metadata key listing the `@Masked` fields of a class and their mask */
const MASKED_METADATA = "webda.masked";

/** Representation of a masked value without pattern */
export const MASKED_VALUE = "********";

/**
 * Mark a field as sensitive: it is masked wherever Webda displays arguments (dry-run result, `DRY RUN` log),
 * like a secret
 *
 * The value stored on the instance is not changed: the model still reads and saves it in clear.
 *
 * With a pattern, each `X` of the pattern hides the character at that position and any other character
 * keeps it; the result always has the pattern length (shorter values are padded with `?`), so the length of
 * the value is not disclosed. Without a pattern, the whole value is replaced by `********`.
 *
 * ```ts
 * class Card extends UuidModel {
 *   @Masked("XXXX-XXXX-XXXX-____")
 *   number: string; // shown as XXXX-XXXX-XXXX-3456
 *   @Masked
 *   pin: string; // shown as ********
 * }
 * ```
 *
 * It is a display rule, not a protection of the stored value: use `EncryptedField<T>` to encrypt it.
 */
export const Masked = createPropertyDecorator((context: ClassFieldDecoratorContext, mask?: string) => {
  // Copy the inherited list so a subclass does not add its fields to its parent's
  const fields: Record<string, string | undefined> = Object.hasOwn(context.metadata, MASKED_METADATA)
    ? (context.metadata[MASKED_METADATA] as Record<string, string | undefined>)
    : { ...((context.metadata[MASKED_METADATA] as Record<string, string | undefined>) ?? {}) };
  fields[String(context.name)] = mask;
  context.metadata[MASKED_METADATA] = fields;
});

/**
 * Fields marked `@Masked` on the class of an object, with their mask
 * @param object - the object to inspect
 * @returns field name to mask (undefined when the field is masked without pattern)
 */
export function getMaskedFields(object: object): Record<string, string | undefined> {
  // @ts-ignore Symbol.metadata is polyfilled by @webda/decorators
  return object.constructor?.[Symbol.metadata]?.[MASKED_METADATA] ?? {};
}

/**
 * Mask a value with a `@Masked` pattern
 * @param value - the value to mask
 * @param mask - the pattern, `X` hides a character; undefined hides the whole value
 * @returns the masked value (undefined and null are kept)
 */
export function applyMask(value: unknown, mask?: string): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (!mask || typeof value !== "string") {
    return MASKED_VALUE;
  }
  const padded = value.padEnd(mask.length, "?");
  let result = "";
  for (let i = 0; i < mask.length; i++) {
    result += mask[i] === "X" ? "X" : padded[i];
  }
  return result;
}

/**
 * Refused: it never encrypted anything (it only prefixed the value with "ENCRYPTED:")
 *
 * Declaring a field with it throws when the class is defined, so a field is not believed encrypted while it
 * is stored in clear. Declare the field as `EncryptedField<T>` (`Webda/Encrypted` behavior), encrypted with
 * the CryptoService.
 * @deprecated use the {@link EncryptedField} behavior (`field: EncryptedField<T>`)
 */
export const Encrypted = createPropertyDecorator((context: ClassFieldDecoratorContext) => {
  throw new Error(
    `@Encrypted does not encrypt (field ${String(context.name)}): declare the field as EncryptedField<T>, encrypted with the CryptoService`
  );
});
