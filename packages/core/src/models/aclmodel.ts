import { Behavior } from "./behavior.js";
export type Acl = { [key: string]: string };

/**
 * Allow to define ACLs for the object
 *
 * It is used as an attribute in the model so
 * you can add it later on to existing models
 *
 */
export class Acls extends Behavior {
  toDTO() {
    throw new Error("Method not implemented.");
  }
  fromDTO(dto: any): void {
    throw new Error("Method not implemented.");
  }

  /**
   * ACLs for the object
   */
  async canAct(action: string, user?: any): Promise<string | boolean> {
    return true;
  }
}
