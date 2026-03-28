import { Context } from "./icontext.js";
/**
 * Global Context is used as system context
 */
export class GlobalContext extends Context {
    /**
     * @override
     */
    getOutputStream() {
        throw new Error("You cannot write to a global context.");
    }
    /**
     * @override
     */
    getCurrentUserId() {
        return "system";
    }
    /**
     * @override
     */
    isGlobalContext() {
        return true;
    }
    /**
     * @override
     */
    getCurrentUser() {
        return undefined;
    }
    /**
     * Provide an empty session object
     * @returns
     */
    getSession() {
        return {};
    }
}
//# sourceMappingURL=globalcontext.js.map