import { UuidModel, WEBDA_EVENTS } from "@webda/models";
/**
 * First basic model for User
 * @class
 * @WebdaModel
 */
export class User extends UuidModel {
    constructor(data) {
        super();
        /**
         * Last time the password was recovered
         */
        this._lastPasswordRecovery = 0;
        Object.assign(this, data);
    }
    /**
     * Return displayable public entry
     * @returns
     * @Frontend
     */
    toPublicEntry() {
        return {
            displayName: this.displayName,
            uuid: this.getUUID(),
            avatar: this._avatar,
            email: this.getEmail()
        };
    }
    /**
     * Get email
     * @returns
     */
    getEmail() {
        return this.email;
    }
    /**
     * Get user groups
     * @returns
     */
    getGroups() {
        return [];
    }
    /**
     * Get roles
     * @returns
     */
    getRoles() {
        return [];
    }
    /**
     * Get display name
     * @returns
     */
    getDisplayName() {
        return this.displayName;
    }
    /**
     *
     * @param timestamp
     * @returns
     */
    lastPasswordRecoveryBefore(timestamp) {
        return this._lastPasswordRecovery < timestamp;
    }
    /**
     * Get the password
     * @returns
     */
    getPassword() {
        return this.__password;
    }
    setPassword(password) {
        this.__password = password;
    }
    async canAct(ctx, action) {
        if (!ctx.getCurrentUserId() || ctx.getCurrentUserId() !== this.getUUID()) {
            return "You can't act on this user";
        }
        return true;
    }
    toString() {
        return `User[${this.getUUID()}]`;
    }
}
//# sourceMappingURL=user.js.map