import { Model, WEBDA_PRIMARY_KEY, BelongTo } from "@webda/models";
import type { User } from "./User.model.js";
import type { IOperationContext } from "@webda/core";

/**
 * UserFollow represents a follower relationship between users
 *
 * This demonstrates:
 * 1. Self-referential relationships (User -> User)
 * 2. Composite primary keys with type inference
 * 3. Join table pattern
 *
 * Permission model (see `canAct` below): anyone reads who follows whom; a user creates and deletes its own
 * follow relationships only (the `follower` side is part of the key and must be the caller).
 */
export class UserFollow extends Model {
  /**
   * Composite primary key: (follower, following)
   * Ensures a user can only follow another user once
   */
  [WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

  /**
   * When the follow relationship was created
   */
  createdAt!: Date;

  // Relations
  follower!: BelongTo<User>; // The user doing the following
  following!: BelongTo<User>; // The user being followed

  /**
   * Permission rule: "get" for anyone, "create" and "delete" for the follower
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
    return this.follower?.toString() === userId ? true : "Only the follower";
  }
}
