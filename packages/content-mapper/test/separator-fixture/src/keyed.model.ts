import { Model, UuidModel, WEBDA_PRIMARY_KEY, WEBDA_PRIMARY_KEY_SEPARATOR } from "../models/index.js";

/** @WebdaModel */
export class Keyed extends Model {
  [WEBDA_PRIMARY_KEY] = ["a", "b"] as const;
  [WEBDA_PRIMARY_KEY_SEPARATOR] = ":";
  a: string;
  b: string;
}

/** @WebdaModel */
export class KeyedChild extends Keyed {}

/** @WebdaModel */
export class Plain extends UuidModel {}
