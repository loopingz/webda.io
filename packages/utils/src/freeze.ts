
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
/**
 * Recursively freeze an object and all of its nested object/function properties.
 *
 * Frozen objects cannot have their properties added, removed, or changed.
 * Properties are frozen depth-first before the object itself is frozen.
 *
 * @param object - The object to freeze recursively.
 * @returns The same object, now deeply frozen.
 */
export function deepFreeze(object) {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = object[name];

    if ((value && typeof value === "object") || typeof value === "function") {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}
