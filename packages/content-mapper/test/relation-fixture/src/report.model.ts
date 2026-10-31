import { ModelLinksAny, UuidModel } from "../models/index.js";
import type { Storable } from "../models/index.js";
import { Author, Post } from "./blog.model.js";

/** @WebdaModel */
export class Report extends UuidModel {
  links: ModelLinksAny<{ rel: string }>;
  bare: ModelLinksAny;
  optional?: ModelLinksAny<object, Author>;
  unrelated: string[];
  restricted: ModelLinksAny<{ rel: string }, Author | Post>;
}

/** @WebdaModel */
export class GenericReport<T extends Storable> extends UuidModel {
  links: ModelLinksAny<object, T>;
}
