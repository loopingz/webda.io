import { UuidModel, BelongTo } from "@webda/models";
import type { User } from "./User";
import type { Post } from "./Post";

/**
 * Comment model for post comments
 */
export class Comment extends UuidModel {
  /**
   * Comment content
   * @minLength 1
   * @maxLength 2000
   */
  content!: string;

  /**
   * Comment creation date
   * @readonly
   */
  createdAt!: Date;

  /**
   * Last update date
   * @readonly
   */
  updatedAt!: Date;

  /**
   * Whether comment is edited
   */
  isEdited!: boolean;

  // Relations
  post!: BelongTo<Post>;
  author!: BelongTo<User>;
}
