/**
 * Session
 */
export declare class Session {
    protected changed: boolean;
    /**
     * Session uuid
     */
    uuid: string;
    /**
     * User id
     */
    userId?: string;
    /**
     * Ident used
     */
    identUsed: string;
    /**
     * User current roles
     */
    roles: string[];
    /**
     * Login
     * @param userId
     * @param identUsed
     */
    login(userId: string, identUsed: string): void;
    /**
     * Logout
     */
    logout(): void;
    /**
     * If session is authenticated
     */
    isLogged(): boolean;
    /**
     * Session is dirty and requires save
     * @returns
     */
    isDirty(): boolean;
    /**
     * Get the proxy to be able to track modification
     * @returns
     */
    getProxy(): this;
}
/**
 * Unknown session that allows all keys
 */
export declare class UnknownSession extends Session {
    /**
     * Allow any type of fields
     */
    [key: string]: any;
}
//# sourceMappingURL=session.d.ts.map