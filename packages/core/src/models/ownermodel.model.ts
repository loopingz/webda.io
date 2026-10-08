//import { UuidModel } from "./uuid.js";
import { type ModelClass, ModelLink, type PrimaryKeyType, UuidModel } from "@webda/models";
import { User } from "./user.model.js";
import { IOperationContext } from "../contexts/icontext.js";
import { bind } from "@webda/ql";

/**
 * Abstract class to define an object with an owner
 *
 * The owner is the user that created the object, set from the caller on create.
 * The owner is never taken from client input.
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
  abstract getOwnerModel(): ModelClass<T>;

  /**
   * Attributes never taken from client input by the DomainService (REST, gRPC, MCP) or GraphQL
   * @returns the attribute names
   */
  static getProtectedAttributes(): string[] {
    return ["_user"];
  }

  /**
   * Called by the DomainService (and GraphQL) on a new object built from client input, before the
   * `canAct(context, "create")` check and the save: the caller becomes the owner
   * @param context - the caller context
   */
  prepareCreate(context: IOperationContext): void {
    const userId = context?.getCurrentUserId();
    if (userId) {
      this.setOwner(userId as any);
    } else {
      // Never keep an owner the caller did not prove
      this._user = undefined;
    }
  }

  /**
   * Set object owner
   * @param uuid - the unique identifier
   */
  setOwner(uuid: PrimaryKeyType<T>): void {
    this._user ??= new ModelLink<T>(this.getOwnerModel()).set(uuid);
    this._user.set(uuid);
  }

  /**
   * Return the owner of the object
   *
   * Only the owner can do update to the object
   * @returns the result
   */
  getOwner(): ModelLink<T> {
    return this._user;
  }

  /**
   * Check if the current user can perform the given action based on ownership
   * @param context - the execution context
   * @param action - the action to check
   * @returns the result
   */
  async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
    // Object is public: readable, binaries included (`<attribute>.download`, `.downloadUrl`, `.get`, `.getUrl`)
    if (this.public && (action === "get" || AbstractOwnerModel.isBinaryRead(action))) {
      return true;
    } else if (!context.getCurrentUserId()) {
      return "You need to be logged in to access this object";
    } else if (!this.getOwner() && action !== "create") {
      return "Object does not have an owner";
    }
    // On create, the owner was set from the caller by prepareCreate: only the owner may create its objects
    return context.getCurrentUserId() === this.getOwner()?.toString();
  }

  /**
   * Whether an action is a binary read (a behavior action of Binary/Binaries): `avatar.download`, `photos.get`...
   * @param action - the action name
   * @returns true for the read actions of binary attributes
   */
  static isBinaryRead(action: string): boolean {
    return /^[^.]+\.(download|downloadUrl|get|getUrl)$/.test(action);
  }

  /**
   * Return a query to filter OwnerModel: the objects of the caller and the public ones
   *
   * The user id is bound as an escaped WebdaQL value, it can never change the query structure.
   *
   * Subclasses inherit this filter even when they override `canAct` (it fails closed: it can only hide rows). A
   * subclass whose `canAct` is more permissive overrides this method (returning `null` disables the store filter).
   *
   * @param context - the execution context
   * @returns the result
   */
  static getPermissionQuery(context?: IOperationContext): null | { partial: boolean; query: string } {
    if (!context) {
      return null;
    }
    const userId = context.getCurrentUserId();
    return {
      query: userId ? bind("_user = ? OR public = TRUE", [userId]) : "public = TRUE",
      partial: false
    };
  }
}

/**
 * @WebdaModel
 */
export class OwnerModel extends AbstractOwnerModel<User> {
  /**
   * Get the User model class used for ownership
   * @returns the result
   */
  getOwnerModel(): ModelClass<User> {
    return User;
  }
}
