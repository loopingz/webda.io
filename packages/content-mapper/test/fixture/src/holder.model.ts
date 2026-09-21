import { UuidModel } from "./runtime.js";
import { MFA } from "./mfa.behavior.model.js";

/** Model holding a Behaviour-typed property. */
export class Holder extends UuidModel {
  mfa: MFA;
  name: string = "";
}
