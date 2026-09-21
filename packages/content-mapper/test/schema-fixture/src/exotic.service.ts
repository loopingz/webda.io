/**
 * Parameter types the converter must refuse, and generic shapes it must
 * resolve rather than silently fall back on.
 *
 * The stage 7 plan makes loud failure the point: a schema that degrades
 * quietly is valid JSON describing the wrong contract, which validates real
 * payloads against it and reports nothing.
 */
import { Service, ServiceParameters } from "./runtime.js";

/** Generic parameters, to prove the base-type walk resolves instantiations. */
export class GenericParameters<T extends object> extends ServiceParameters {
  /** `keyof T` widens to the key primitives. */
  key: keyof T;
}

/** Service whose parameters are a generic instantiation. */
export class GenericService<T extends object> extends Service<GenericParameters<T>> {}

/** Parameters holding a template literal type. */
export class TemplateParameters extends ServiceParameters {
  /** Constrains a string in a way draft-07 cannot express. */
  prefixed: `pre-${string}`;
}

/** Service the converter must refuse to convert. */
export class TemplateService extends Service<TemplateParameters> {}

/** Parameters holding a mapped string type. */
export class MappedStringParameters extends ServiceParameters {
  /** `Uppercase<string>` is string-like but not `string`. */
  shouted: Uppercase<string>;
}

/** Service the converter must refuse to convert. */
export class MappedStringService extends Service<MappedStringParameters> {}
