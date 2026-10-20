import type { ModelLink } from "../models/index.js";
import { UuidModel } from "../models/index.js";
import { Author } from "./blog.model.js";

/** @WebdaModel */
export abstract class Owned<T extends Author> extends UuidModel {
  owner: ModelLink<T>;
  reader?: ModelLink<T>;
}

/** @WebdaModel */
export class Draft extends Owned<Author> {}
