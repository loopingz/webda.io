import { UuidModel, BelongTo } from "@webda/models";
import type { User } from "./User.model.js";
import type { Post } from "./Post.model.js";
import type { IOperationContext } from "@webda/core";

/**
 * Comment model for post comments
 *
 * Permission model (see `canAct` below): anyone reads, logged-in users comment, the author edits and deletes.
 * The author is always the caller: set on create, never taken from client input.
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

  /**
   * The author is server-managed: never taken from client input
   * @returns the protected attributes
   */
  static getProtectedAttributes(): string[] {
    return ["author"];
  }

  /**
   * Called on a new comment built from client input, before the "create" check: the caller is the author
   * @param context - the caller context
   */
  prepareCreate(context: IOperationContext): void {
    (this as any).author = context.getCurrentUserId();
    this.createdAt ??= new Date();
    this.updatedAt ??= this.createdAt;
    this.isEdited ??= false;
  }

  /**
   * Permission rule: "get" for anyone, "create" for any logged-in user, "update" and "delete" for the author
   * @param context - the caller context
   * @param action - the action
   * @returns true or the refusal reason
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    const userId = context.getCurrentUserId();
    if (action === "get") {
      return true;
    }
    if (!userId) {
      return "Login required";
    }
    if (action === "create") {
      return true;
    }
    return this.author?.toString() === userId ? true : "Only the author";
  }
}
