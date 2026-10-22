import type { BelongTo, Contains, ManyToOne } from "../models/index.js";
import { UuidModel } from "../models/index.js";

/** @WebdaModel */
export class Target extends UuidModel {}

/** @WebdaModel */
export class Broken extends UuidModel {
  /** @OnDelete FOO */
  owner: ManyToOne<Target>;
  /** @OnDelete SET_NULL */
  target: BelongTo<Target>;
  /** @OnDelete SET_NULL */
  items: Contains<Target>;
}
