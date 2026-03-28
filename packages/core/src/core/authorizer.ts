
/**
 * Give your opinion about an action
 * 
 * You have 3 choices:
 *  - yes: the action is allowed
 *  - no: the action is denied
 *  - hard no: the action is denied no matter what (even if another authorizer say yes)
 */
export type AuthorizerFunction = (...args: any[]) => boolean | Promise<boolean>;

/**
 * Check authorizer functions
 * 
 * Return true if one of the authorizer allow the action
 * Return false if all authorizer deny the action
 * Throw exeption if one of the authorizer return a hard no
 * 
 * @param authorizer 
 * @param args 
 * @returns 
 * @see AuthorizerFunction
 */
export async function checkAuthorizer(authorizer: AuthorizerFunction[], ...args: any[]): Promise<boolean> {
  // Run all authorizer in parallel and return true if one of them authorize the action
  return await Promise.all(authorizer.map(fn => fn(...args))).then(results => results.find(r => r));
}