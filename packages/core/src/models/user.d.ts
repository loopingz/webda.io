import { IOperationContext } from "../contexts/icontext.js";
import { ModelEvents, Settable, UuidModel, WEBDA_EVENTS } from "@webda/models";
export type UserEvents<T> = ModelEvents<T> & {
    Login: {
        user: T;
    };
    Logout: {
        user: T;
    };
};
/**
 * First basic model for User
 * @class
 * @WebdaModel
 */
export declare class User extends UuidModel {
    [WEBDA_EVENTS]: UserEvents<this>;
    constructor(data?: Settable<User>);
    /**
     * Password of the user if defined
     */
    __password?: string;
    /**
     * Display name for this user
     * @optional
     * @Frontend
     */
    displayName: string;
    /**
     * Last time the password was recovered
     */
    _lastPasswordRecovery?: number;
    /**
     * Define the user avatar if exists
     */
    _avatar?: string;
    /**
     * Contains the locale of the user if known
     */
    locale?: string;
    /**
     * Contain main user email if exists
     */
    email?: string;
    /**
     * Return displayable public entry
     * @returns
     * @Frontend
     */
    toPublicEntry(): any;
    /**
     * Get email
     * @returns
     */
    getEmail(): string | undefined;
    /**
     * Get user groups
     * @returns
     */
    getGroups(): string[];
    /**
     * Get roles
     * @returns
     */
    getRoles(): string[];
    /**
     * Get display name
     * @returns
     */
    getDisplayName(): string;
    /**
     *
     * @param timestamp
     * @returns
     */
    lastPasswordRecoveryBefore(timestamp: number): boolean;
    /**
     * Get the password
     * @returns
     */
    getPassword(): string;
    setPassword(password: string): void;
    canAct(ctx: IOperationContext, action: string): Promise<string | boolean>;
    toString(): string;
}
//# sourceMappingURL=user.d.ts.map