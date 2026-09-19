import { Model, WEBDA_PRIMARY_KEY, BelongTo, ModelClass, RelateTo } from "@webda/models";
import type { Post } from "./Post";
import type { Tag } from "./Tag";

/**
 * PostTag join table demonstrating composite primary keys
 *
 * This is a classic many-to-many join table that shows the power
 * of composite keys with full type inference.
 */
export class PostTag extends Model {
  /**
   * Composite primary key
   * TypeScript will infer getPrimaryKey() returns Pick<PostTag, "post" | "tag">
   */
  [WEBDA_PRIMARY_KEY] = ["post", "tag"] as const;

  /**
   * When this relationship was created
   */
  createdAt!: Date;

  // Relations to actual objects
  post!: BelongTo<Post>;
  tag!: RelateTo<Tag>;
}
