/**
 * A service exported as an anonymous default: `webda.module.json` records it
 * as `:default`, and there is no class name to find it by.
 */
import { Service, ServiceParameters } from "./runtime.js";

/** Parameters of the anonymous service. */
export class AnonymousParameters extends ServiceParameters {
  /** A flag. */
  flag?: boolean;
}

export default class extends Service<AnonymousParameters> {}
