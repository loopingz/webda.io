import { UuidModel } from "./runtime.js";

/** Generic intermediate, mirroring AbstractOwnerModel in @webda/core. */
export abstract class AbstractOwner<T extends { id: string }> extends UuidModel {
  owner: T;
}

/** Concrete intermediate. */
export class Owner extends AbstractOwner<{ id: string }> {}

/** Three links from UuidModel, through a generic. Must still be coerced. */
export class DeepChild extends Owner {
  seenAt: Date;
}
