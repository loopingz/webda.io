import { ModelClass, ModelLink, PrimaryKeyType, UuidModel } from "@webda/models";
import { User } from "./user.js";
import { IOperationContext } from "../contexts/icontext.js";
/**
 * Abstract class to define an object with an owner
 *
 * The owner is the user that created the object
 * The owner can be changed by the owner
 */
export declare abstract class AbstractOwnerModel<T extends User> extends UuidModel {
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
     * Set object owner
     * @param uuid
     */
    setOwner(uuid: PrimaryKeyType<T>): void;
    /**
     * Return the owner of the object
     *
     * Only the owner can do update to the object
     * @returns
     */
    getOwner(): ModelLink<T>;
    canAct(context: IOperationContext, action: string): Promise<string | boolean>;
    /**
     * Return a query to filter OwnerModel
     *
     * @param context
     * @returns
     */
    static getPermissionQuery(context?: IOperationContext): null | {
        partial: boolean;
        query: string;
    };
}
/**
 * @WebdaModel
 */
export declare class OwnerModel extends AbstractOwnerModel<User> {
    getOwnerModel(): ModelClass<User>;
}
//# sourceMappingURL=ownermodel.d.ts.map