import { Context, IContextAware } from "./icontext.js";
/**
 * Get current execution context
 */
export declare function useContext<T extends Context>(): T;
/**
 * Shortcut to get the current user
 * @returns
 */
export declare function useCurrentUser(): Promise<any>;
/**
 * Shortcut to get the current user id
 * @returns
 */
export declare function useCurrentUserId(): string;
/**
 * Run this function as system
 *
 * @param run
 * @returns
 */
export declare function runAsSystem<T>(run: () => T, attach?: IContextAware[]): T;
/**
 * Run this function as user
 * @param context
 * @param run
 * @returns
 */
export declare function runWithContext<T>(context: Context, run: () => T, attach?: IContextAware[]): T;
//# sourceMappingURL=execution.d.ts.map