import { Model, ModelEvents, WEBDA_EVENTS } from "../models/index.js";

/** @WebdaModel */
export class Inherited extends Model {
  name: string;
}

/** @WebdaModel */
export class Extended extends Model {
  declare [WEBDA_EVENTS]?: ModelEvents<this> & { Archived: { object: Extended } };
  name: string;
}
