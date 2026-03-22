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
   * TypeScript will infer getPrimaryKey() returns Pick<PostTag, "postUuid" | "tagUuid">
   */
  [WEBDA_PRIMARY_KEY] = ["postUuid", "tagUuid"] as const;

  /**
   * Reference to post
   */
  postUuid!: string;

  /**
   * Reference to tag
   */
  tagUuid!: string;

  /**
   * When this relationship was created
   */
  createdAt!: Date;

  // Relations to actual objects
  post!: BelongTo<Post>;
  tag!: RelateTo<Tag>;

  static getDeserializers<T extends ModelClass>(
    this: T
  ): Partial<Record<keyof InstanceType<T>, (value: any) => any>> | undefined {
    return {
      createdAt: Model.DefaultDeserializer.Date
    } as any;
  }
}

PostTag.registerSerializer();
