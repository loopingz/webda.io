import { UuidModel } from "./runtime.js";
import { MFA } from "./mfa.behavior.model.js";

/** Model holding a Behaviour-typed property. */
export class Holder extends UuidModel {
  mfa: MFA;
  name: string = "";
}

/** A second behavior on a subclass must preserve the inherited one. */
export class PaymentHolder extends Holder {
  paymentMfa: MFA;
}

/** A behavior holder does not require a base class. */
export class StandaloneHolder {
  mfa: MFA;
}
