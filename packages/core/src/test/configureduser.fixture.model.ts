import { User } from "../models/user.model.js";
import { Parameters } from "../application/parameters.js";

/** Runtime policy for the configurable test model. */
export class UserPolicy extends Parameters {
  /** Maximum retained items. @minimum 1 */
  limit: number = 10;
  labels: string[] = ["default"];
}

/** Model fixture with typed, non-persisted configuration.
 * @WebdaIgnore
 */
export class ConfiguredUser extends User {
  static Parameters = UserPolicy;
}
