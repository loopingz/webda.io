//import { UuidModel } from "./uuid.js";
import { ModelLink, UuidModel } from "@webda/models";
import { User } from "./user.js";
/**
 * Abstract class to define an object with an owner
 *
 * The owner is the user that created the object
 * The owner can be changed by the owner
 */
export class AbstractOwnerModel extends UuidModel {
    /**
     * Set object owner
     * @param uuid
     */
    setOwner(uuid) {
        this._user ?? (this._user = new ModelLink(this.getOwnerModel()).set(uuid));
        this._user.set(uuid);
    }
    /**
     * Return the owner of the object
     *
     * Only the owner can do update to the object
     * @returns
     */
    getOwner() {
        return this._user;
    }
    async canAct(context, action) {
        // Object is public
        if (this.public && (action === "get" || action === "get_binary")) {
            return true;
        }
        else if (!context.getCurrentUserId()) {
            return "You need to be logged in to access this object";
        }
        else if (!this.getOwner() && action !== "create") {
            return "Object does not have an owner";
        }
        if (action === "create") {
            //this.setOwner(Uuid.parse(ctx.getCurrentUserId(), this.getOwnerModel()));
        }
        return context.getCurrentUserId() === this.getOwner()?.toString();
    }
    /**
     * Return a query to filter OwnerModel
     *
     * @param context
     * @returns
     */
    static getPermissionQuery(context) {
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
export class OwnerModel extends AbstractOwnerModel {
    getOwnerModel() {
        return User;
    }
}
//# sourceMappingURL=ownermodel.js.map