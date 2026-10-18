import { Model, UuidModel, WEBDA_PRIMARY_KEY, WEBDA_PRIMARY_KEY_SEPARATOR } from "../models/index.js";

/** Policy of the configurable model. */
export class KeyedParameters {
  limit: number = 10;
}

/** @WebdaModel */
export class Keyed extends Model {
  static Parameters = KeyedParameters;
  [WEBDA_PRIMARY_KEY] = ["a", "b"] as const;
  [WEBDA_PRIMARY_KEY_SEPARATOR] = ":";
  a: string;
  b: string;
}

/** @WebdaModel */
export class KeyedChild extends Keyed {
  declare static Parameters: typeof KeyedParameters;
}

/** @WebdaModel */
export class Plain extends UuidModel {
  static Parameters = undefined;
  Parameters?: object;
}
