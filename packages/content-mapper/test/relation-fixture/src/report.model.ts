import { ModelLinksAny, UuidModel } from "../models/index.js";
import { Author, Post } from "./blog.model.js";

/** @WebdaModel */
export class Report extends UuidModel {
  links: ModelLinksAny<{ rel: string }>;
  restricted: ModelLinksAny<{ rel: string }, Author | Post>;
}
