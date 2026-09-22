/**
 * The generator set both hosts run by default.
 *
 * One list, not two. The editor ({@link WarmSession}) and the build
 * ({@link runTwoPass}) must produce the same text, or hover and diagnostics
 * describe code that is not the code that ships. Keeping two literal lists
 * equal by hand is exactly how that drifts.
 *
 * `loadParametersGenerator` is deliberately **not** here. Nothing in the
 * framework calls `loadParameters`: a service's parameters are built by
 * `createConfiguration`, which `Application` installs from the
 * `Configuration` entry in `webda.module.json`. The TypeScript 6 pipeline
 * never generated it either — that was `webdac code`, which walked zero
 * files. Generating it would add a dead method to every service and break
 * emit parity with what ships today. It stays exported for callers who
 * still want it.
 */
import { accessorsGenerator, type AccessorOptions } from "./generators/accessors.ts";
import { behaviorsGenerator } from "./generators/behaviors.ts";
import { qlValidatorGenerator } from "./generators/qlvalidator.ts";
import type { Generator } from "./plan.ts";

/** Options the default generators accept. */
export interface DefaultGeneratorOptions extends AccessorOptions {
  /** Module specifier providing the WebdaQL `escape` helper. */
  qlModule?: string;
}

/**
 * Build the default generator set.
 * @param options - storage and WebdaQL module specifiers
 * @returns the generators, in the order they run
 */
export function defaultGenerators(options: DefaultGeneratorOptions = {}): Generator[] {
  return [
    accessorsGenerator({ accessorsForAll: options.accessorsForAll, storageModule: options.storageModule }),
    behaviorsGenerator({ storageModule: options.storageModule }),
    qlValidatorGenerator({ qlModule: options.qlModule })
  ];
}
