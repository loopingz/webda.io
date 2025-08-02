import type { Context } from "../contexts/icontext";
import { ActionsEnum, ActionWrapper, Exposable } from "@webda/models";

export type Acl = { [key: string]: string };

/**
 * Allow to define ACLs for the object
 *
 * It is used as an attribute in the model so
 * you can add it later on to existing models
 *
 */
export class Acls implements Exposable {
  toDTO() {
    throw new Error("Method not implemented.");
  }
  fromDTO(dto: any): void {
    throw new Error("Method not implemented.");
  }

  setAcl = ActionWrapper(() => {}, "Set the ACLs for the object");

  getAcl = ActionWrapper(() => {}, "Get the ACLs for the object");
  /**
   * ACLs for the object
   */
  async canAct(context: Context, action: ActionsEnum<Acls>): Promise<string | boolean> {
    return true;
  }
}
