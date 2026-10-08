import type { IOperationContext } from "../contexts/icontext.js";

/**
 * Access control entry
 */
export type Ace = {
  /**
   * Action the entry applies to ("get", "update", "delete", an action name...)
   */
  action: string;
  /**
   * Kind of principal: a user id or a group name
   */
  type: "GROUP" | "USER";
  /**
   * The user id (type USER) or group name (type GROUP) the entry applies to.
   * An entry without principal matches nobody.
   */
  principal?: string;
  /**
   * Allow or deny: a matching deny wins over any allow
   */
  allow: boolean;
};

/**
 * Allow to define ACLs for the object
 *
 * It is used as an attribute in the model so
 * you can add it later on to existing models; the model delegates its permissions to it:
 *
 * ```ts
 * async canAct(context: IOperationContext, action: string) {
 *   return ResourceAcl.from(this.acl ?? []).canAct(context, action);
 * }
 * ```
 */
export class ResourceAcl extends Array<Ace> {
  /**
   * Serialize the ACL to a plain array of ACEs
   * @returns the list of results
   */
  toDto(): Ace[] {
    return this;
  }

  /**
   * Replace the ACL entries from a DTO array
   * @param dto - the data transfer object
   */
  fromDto(dto: Ace[]): void {
    this.length = 0;
    for (const ace of dto) {
      this.push(ace);
    }
  }

  /**
   * Check the ACL for the current caller, with the same signature as a model `canAct`
   *
   * An entry matches when its action is `action` and its principal is the caller id (USER) or one of the caller
   * groups (GROUP). A matching deny wins, then a matching allow; with no matching entry the action is refused.
   * Anonymous callers match no entry.
   * @param context - the caller context
   * @param action - the action to check
   * @returns true or the refusal reason
   */
  async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
    const userId = context?.getCurrentUserId();
    if (!userId) {
      return "no matching ACE in resource ACL";
    }
    const entries = this.filter(a => a.action === action && a.principal);
    let groups: string[] | undefined;
    const matches = async (ace: Ace): Promise<boolean> => {
      if (ace.type === "USER") {
        return ace.principal === userId;
      }
      if (ace.type === "GROUP") {
        groups ??= (await context.getCurrentUser())?.getGroups?.() ?? [];
        return groups.includes(ace.principal);
      }
      return false;
    };
    for (const ace of entries.filter(a => !a.allow)) {
      if (await matches(ace)) {
        return "explicitly denied by resource ACL";
      }
    }
    for (const ace of entries.filter(a => a.allow)) {
      if (await matches(ace)) {
        return true;
      }
    }
    return "no matching ACE in resource ACL";
  }
}
