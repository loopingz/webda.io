export * from "./case";
export * from "./chdir";
export * from "./esm";
export * from "./regexp";
export * from "./serializers";
export * from "./state";
export * from "./stream";
export * from "./throttler";
export * from "./uuid";
export * from "./waiter";

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
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
