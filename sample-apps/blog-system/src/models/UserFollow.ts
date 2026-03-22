import { Model, WEBDA_PRIMARY_KEY, BelongTo } from "@webda/models";
import type { User } from "./User";

/**
 * UserFollow represents a follower relationship between users
 *
 * This demonstrates:
 * 1. Self-referential relationships (User -> User)
 * 2. Composite primary keys with type inference
 * 3. Join table pattern
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
}
