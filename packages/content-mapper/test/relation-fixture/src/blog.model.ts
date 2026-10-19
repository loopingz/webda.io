import type {
  BelongTo,
  Contains,
  ManyToMany,
  ManyToOne,
  ModelLinksSimpleArray,
  ModelParent,
  ModelRelated,
  OneToMany,
  OneToOne,
  RelateTo
} from "../models/index.js";
import { UuidModel } from "../models/index.js";

/** @WebdaModel */
export class Author extends UuidModel {
  posts: OneToMany<Post, Author, "author">;
}

/** @WebdaModel */
export class Tag extends UuidModel {
  posts: ModelRelated<Post, Tag, "tags">;
  untargeted: ModelRelated<Post, Tag>;
}

/** @WebdaModel */
export class Post extends UuidModel {
  author: BelongTo<Author>;
  editor: ManyToOne<Author>;
  reviewer: OneToOne<Author>;
  sponsor: RelateTo<Author>;
  tags: ManyToMany<Tag>;
  labels: Contains<Tag>;
  related: ModelLinksSimpleArray<Post>;
}

/** @WebdaModel */
export class Comment extends UuidModel {
  post: ModelParent<Post>;
  thread: BelongTo<Post>;
}
