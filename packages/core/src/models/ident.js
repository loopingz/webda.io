import { OwnerModel } from "./ownermodel.js";
export class IdentTokens {
}
/**
 * First basic model for Ident
 * @class
 * @WebdaModel
 */
export class Ident extends OwnerModel {
    constructor(data) {
        super(data);
        /**
         * Last time the ident was used
         */
        this._lastUsed = undefined;
        /**
         * If the ident is validated
         */
        this._failedLogin = 0;
        /**
         * If EmailIdent
         */
        this._lastValidationEmail = 0;
    }
    getEmail() {
        return this.email;
    }
    getType() {
        return this._type;
    }
    setType(type) {
        this._type = type;
    }
    getUser() {
        return this.getOwner();
    }
    setUser(uuid) {
        this.setOwner(typeof uuid === "string" ? uuid : uuid.getPrimaryKey());
    }
}
//# sourceMappingURL=ident.js.map