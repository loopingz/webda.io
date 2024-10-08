import { Writable } from "stream";
import { Context } from "./icontext";

/**
 * Global Context is used as system context
 */
export class GlobalContext extends Context {
  /**
   * @override
   */
  getOutputStream(): Promise<Writable> {
    throw new Error("You cannot write to a global context.");
  }

  /**
   * @override
   */
  getCurrentUserId(): string {
    return "system";
  }

  /**
   * @override
   */
  isGlobalContext(): boolean {
    return true;
  }

  /**
   * @override
   */
  getCurrentUser(): Promise<undefined> {
    return undefined;
  }
}
