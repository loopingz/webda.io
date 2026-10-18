import { Model } from "../models/index.js";

/**
 * A plant, renamed twice
 *
 * @WebdaModel
 * @WebdaAlias Flora
 * @WebdaAlias Legacy/Greenery
 * @WebdaAlias Flora
 */
export class Plant extends Model {
  name: string;
}

/** @WebdaModel */
export class Tree extends Plant {
  height: number;
}

/**
 * @WebdaModel
 * @WebdaAlias Tree
 */
export class Shrub extends Model {
  width: number;
}
