import { Writable } from "stream";
import { Context } from "./icontext.js";
/**
 * Global Context is used as system context
 */
export declare class GlobalContext extends Context {
    /**
     * @override
     */
    getOutputStream(): Promise<Writable>;
    /**
     * @override
     */
    getCurrentUserId(): string;
    /**
     * @override
     */
    isGlobalContext(): boolean;
    /**
     * @override
     */
    getCurrentUser(): Promise<undefined>;
    /**
     * Provide an empty session object
     * @returns
     */
    getSession(): {};
}
//# sourceMappingURL=globalcontext.d.ts.map