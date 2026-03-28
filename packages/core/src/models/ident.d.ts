import { Settable } from "@webda/models";
import { OwnerModel } from "./ownermodel.js";
import type { User } from "./user.js";
export declare class IdentTokens {
    refresh: string;
    access: string;
}
/**
 * First basic model for Ident
 * @class
 * @WebdaModel
 */
export declare class Ident extends OwnerModel {
    constructor(data?: Settable<Ident>);
    /**
     * Type of the ident
     */
    _type: string;
    /**
     * Uid on the provider
     */
    uid: string;
    /**
     * Provider profile
     */
    __profile: any;
    /**
     * Tokens for this ident
     */
    __tokens: IdentTokens;
    /**
     * Last time the ident was used
     */
    _lastUsed?: Date;
    /**
     * If the ident is validated
     */
    _failedLogin: number;
    /**
     * If EmailIdent
     */
    _lastValidationEmail?: number;
    /**
     * When the ident was validated
     */
    _validation?: Date;
    /**
     * Email for this ident if it exist
     */
    email?: string;
    /**
     * Provider id
     */
    provider?: string;
    getEmail(): string;
    getType(): string;
    setType(type: any): void;
    getUser(): import("@webda/models").ModelLink<User>;
    setUser(uuid: string | User): void;
}
//# sourceMappingURL=ident.d.ts.map