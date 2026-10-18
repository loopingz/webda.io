import { MFA } from "@webda/core/lib/models/mfa.model.js";
import { User } from "@webda/core/lib/models/user.model.js";

/** User with independent MFA attributes for integration tests.
 * @WebdaIgnore
 */
export class MfaUser extends User {
  loginMfa: MFA;
  paymentMfa: MFA;
}
