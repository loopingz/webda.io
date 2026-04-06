export type Ace = {
  action: string;
  type: "GROUP" | "USER";
  allow: boolean;
};

/**
 * Allow to define ACLs for the object
 *
 * It is used as an attribute in the model so
 * you can add it later on to existing models
 *
 */
export class ResourceAcl extends Array<Ace> {
  /** Serialize the ACL to a plain array of ACEs */
  toDto(): Ace[] {
    return this;
  }

  /** Replace the ACL entries from a DTO array */
  fromDto(dto: Ace[]): void {
    this.length = 0;
    for (const ace of dto) {
      this.push(ace);
    }
  }

  /**
   * ACLs for the object
   */
  async canAct(action: string, user?: any): Promise<string | boolean> {
    for (const ace of this.filter(a => !a.allow)) {
      if (ace.action === action) {
        return "explicitly denied by resource ACL";
      }
    }
    for (const ace of this.filter(a => a.allow)) {
      if (ace.action === action) {
        return true;
      }
    }
    return "no matching ACE in resource ACL";
  }
}
