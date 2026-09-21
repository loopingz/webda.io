import { ModelLink, UuidModel } from "./runtime.js";
import { Team } from "./team.model.js";
import type { TypeOnlyTarget } from "./typeonly.model.js";

/**
 * Relation declared on a generic class. The written type argument is a type
 * parameter, which does not exist at runtime, so the constraint must be used.
 */
export abstract class AbstractOwned<T extends Team> extends UuidModel {
  owner: ModelLink<T>;
}

/** Model with an initialised coercible field. */
export class Stamped extends UuidModel {
  seenAt: Date = new Date(0);
}

/** The target is imported for types only, so it cannot be referenced at runtime. */
export class TypeOnlyOwner extends UuidModel {
  link: ModelLink<TypeOnlyTarget>;
}
