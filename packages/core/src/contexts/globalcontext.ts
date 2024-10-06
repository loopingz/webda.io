import { Context } from "./icontext";

/**
 * Global Context is used as system context
 */
export class GlobalContext extends Context {
  getCurrentUserId(): string {
    return "system";
  }

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
