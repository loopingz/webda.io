import { User } from "./user.js";
/**
 * Simple user offers groups and roles management
 *
 * Groups and roles are defined just as string, no
 * models
 */
export class SimpleUser extends User {
    constructor(data) {
        super(data);
        /**
         * Groups for a user
         */
        this._groups = [];
        /**
         * Roles of the user
         */
        this._roles = [];
    }
    /**
     * Return idents
     * @returns
     */
    getIdents() {
        return this._idents;
    }
    /**
     * Add a group for the user
     * @param group
     * @returns
     */
    addGroup(group) {
        if (this.inGroup(group)) {
            return;
        }
        this._groups.push(group);
    }
    /**
     *
     * @param group
     * @returns
     */
    inGroup(group) {
        if (group === "all" || group === this.uuid) {
            return true;
        }
        return this._groups.includes(group);
    }
    removeGroup(group) {
        const ind = this._groups.indexOf(group);
        if (ind < 0) {
            return;
        }
        this._groups.splice(ind, 1);
    }
    getGroups() {
        return this._groups;
    }
    getRoles() {
        return this._roles;
    }
    addRole(role) {
        if (this.hasRole(role)) {
            return;
        }
        this._roles.push(role);
    }
    hasRole(role) {
        return this._roles.indexOf(role) >= 0;
    }
    removeRole(role) {
        const ind = this._roles.indexOf(role);
        if (ind < 0) {
            return;
        }
        this._roles.splice(ind, 1);
    }
}
//# sourceMappingURL=simpleuser.js.map