import { ServiceParameters } from "./runtime.js";

/** Runtime policy of the fixture behavior. */
export class MfaPolicy extends ServiceParameters {
  lifetime: number = 60;
}

/** @WebdaBehavior */
export class MFA {
  static Parameters = MfaPolicy;
  secret: string;
}

/** Behaviour that already defines toJSON; it must be preserved. */
/** @WebdaBehavior */
export class Audited {
  at: string;
  toJSON() {
    return { authored: true };
  }
}
