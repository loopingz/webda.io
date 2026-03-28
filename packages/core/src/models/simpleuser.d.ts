import type { Ident } from "./ident.js";
import { ModelRelated, Settable } from "@webda/models";
import { User } from "./user.js";
/**
 * Simple user offers groups and roles management
 *
 * Groups and roles are defined just as string, no
 * models
 */
export declare class SimpleUser extends User {
    constructor(data?: Settable<SimpleUser>);
    /**
     * Groups for a user
     */
    _groups: string[];
    /**
     * Roles of the user
     */
    _roles: string[];
    /**
     * Normal ident
     */
    _idents: ModelRelated<Ident, User, "_user">;
    /**
     * Return idents
     * @returns
     */
    getIdents(): any;
    /**
     * Add a group for the user
     * @param group
     * @returns
     */
    addGroup(group: string): void;
    /**
     *
     * @param group
     * @returns
     */
    inGroup(group: string): boolean;
    removeGroup(group: string): void;
    getGroups(): string[];
    getRoles(): string[];
    addRole(role: string): void;
    hasRole(role: string): boolean;
    removeRole(role: string): void;
}
//# sourceMappingURL=simpleuser.d.ts.map