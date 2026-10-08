import { Model, WEBDA_PRIMARY_KEY, BelongTo, RelateTo } from "@webda/models";
import type { Post } from "./Post.model.js";
import type { Tag } from "./Tag.model.js";
import type { IOperationContext } from "@webda/core";

/**
 * PostTag join table demonstrating composite primary keys
 *
 * This is a classic many-to-many join table that shows the power
 * of composite keys with full type inference.
 *
 * Permission model (see `canAct` below): anyone reads; tagging and untagging a post is the post author's.
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

  /**
   * Permission rule: "get" for anyone; "create" and "delete" for the author of the post
   * @param context - the caller context
   * @param action - the action
   * @returns true or the refusal reason
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (action === "get") {
      return true;
    }
    const userId = context.getCurrentUserId();
    if (!userId) {
      return "Login required";
    }
    try {
      // The post decides: its author may tag it (the same rule as editing it)
      const { Post } = await import("./Post.model.js");
      const post = await Post.ref(this.post?.toString()).get();
      return (await post.canAct(context, "update")) === true ? true : "Only the post author";
    } catch {
      return "Unknown post";
    }
  }
}
