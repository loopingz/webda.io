/**
 * Check if the object is a Securable
 * @param obj
 * @returns boolean indicating if the object is Securable
 */
export function isSecurable(obj: any): obj is Securable {
  return typeof obj.toProxy === "function";
}

/**
 * Securable interface
 *
 * The toProxy method is used to convert the object to a proxy object
 * This way you can control the dirtyness of the object or restrict attributes
 * access within the runtime
 */
export interface Securable<T = any> {
  toProxy(): T;
}
