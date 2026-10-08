import { Model, WEBDA_PRIMARY_KEY, OneToMany } from "@webda/models";
import type { Post } from "./Post.model.js";
import type { IOperationContext } from "@webda/core";

/**
 * Tag model for categorizing posts
 *
 * Permission model (static form, the rule does not depend on the tag): anyone reads, logged-in users create,
 * nobody edits or deletes (this sample has no administrator role; a real application would check one here).
 */
export class Tag extends Model {
  /**
   * Primary key: slug
   */
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  /**
   * Tag name
   * @minLength 2
   * @maxLength 30
   */
  name!: string;

  /**
   * URL-friendly slug
   * @minLength 2
   * @maxLength 50
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * Tag description
   * @maxLength 200
   */
  description?: string;

  /**
   * Tag color (hex)
   * @pattern ^#[0-9A-Fa-f]{6}$
   */
  color?: string;

  // Relations
  posts!: OneToMany<Post, Tag, "tags">; // Posts associated with this tag

  /**
   * Permission rule
   * @param context - the caller context
   * @param action - the action
   * @param _object - the tag (unused: the rule is the same for every tag)
   * @returns true or the refusal reason
   */
  static canAct(context: IOperationContext, action: string, _object?: Tag): boolean | string {
    if (action === "get") {
      return true;
    }
    if (action === "create") {
      return context.getCurrentUserId() ? true : "Login required";
    }
    // update, delete: e.g. `return context.getSession()?.roles?.includes("admin") ? true : "Admin only";`
    return "Tags are not editable in this sample";
  }
}
