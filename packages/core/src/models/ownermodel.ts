import { ActionsEnum, ModelLink, PrimaryKeyType, UuidModel } from "@webda/models";
import { User } from "./user";
import { IOperationContext } from "../contexts/icontext";
import { useContext } from "../contexts/execution";

/**
 * Abstract class to define an object with an owner
 *
 * The owner is the user that created the object
 * The owner can be changed by the owner
 */
export abstract class AbstractOwnerModel<T extends User> extends UuidModel {
  /**
   * Default owner of the object
   */
  _user: ModelLink<T>;
  /**
   * Define if the object is publicly readable
   * @default false
   */
  public?: boolean;

  /**
   *
   * @returns
   */
  //abstract getOwnerModel(): ModelClass<T>;

  /**
   * Set object owner
   * @param uuid
   */
  setOwner(uuid: PrimaryKeyType<T>): void {
    this._user ??= new ModelLink<T>(uuid, <any>User, this);
    this._user.set(uuid);
  }

  /**
   * Return the owner of the object
   *
   * Only the owner can do update to the object
   * @returns
   */
  getOwner(): ModelLink<T> {
    return this._user;
  }

  async canAct(action: ActionsEnum<this>): Promise<string | boolean> {
    const ctx = useContext();
    // Object is public
    if (this.public && (action === "get" || action === "get_binary")) {
      return true;
    } else if (!ctx.getCurrentUserId()) {
      return "You need to be logged in to access this object";
    } else if (!this.getOwner() && action !== "create") {
      return "Object does not have an owner";
    }
    if (action === "create") {
      //this.setOwner(Uuid.parse(ctx.getCurrentUserId(), this.getOwnerModel()));
    }
    return ctx.getCurrentUserId() === this.getOwner()?.toString();
  }

  /**
   * Return a query to filter OwnerModel
   *
   * @param context
   * @returns
   */
  static getPermissionQuery(context?: IOperationContext): null | { partial: boolean; query: string } {
    if (!context) {
      return null;
    }
    return {
      query: `_user = '${context.getCurrentUserId()}' OR public = TRUE`,
      partial: false
    };
  }
}

/**
 * @WebdaModel
 */
export class OwnerModel extends AbstractOwnerModel<User> {
  // getOwnerModel(): ModelClass<User> {
  //   return <any>User;
  // }
}
