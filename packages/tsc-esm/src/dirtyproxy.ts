/**
 * Proxied object
 */
export type DirtyProxied<T> = T & { isDirty: boolean; dirtyProperties: (string | symbol)[] };

/**
 * Proxy an object to keep its state
 * @param object
 * @returns
 */
export function getDirtyProxy<T>(
  object: T,
  validator: (mode: "get" | "set" | "delete", property: string | symbol, value: any) => any = (_mode, _, value) => value
): DirtyProxied<T> {
  const dirty = new Set<string | symbol>();
  const subProxier = prop => {
    return {
      set: (target: T, p: string | symbol, value) => {
        dirty.add(prop);
        target[p] = value;
        return true;
      },
      get: (target: T, p: string | symbol) => {
        const value = target[p];
        if (Array.isArray(target[p]) || target[p] instanceof Object) {
          return new Proxy(value, subProxier(prop));
        }
        return value;
      },
      deleteProperty: (t, property) => {
        delete t[property];
        dirty.add(prop);
        return true;
      }
    };
  };
  const proxier = {
    deleteProperty: (t, property) => {
      validator("delete", property, undefined);
      delete t[property];
      dirty.add(property);
      return true;
    },
    set: (target: T, p: string | symbol, value) => {
      if (p === "isDirty") {
        if (!value) {
          dirty.clear();
        }
        return true;
      } else if (p === "dirtyProperties") {
        return true;
      }
      value = validator("set", p, value);
      dirty.add(p);
      target[p] = value;
      return true;
    },
    get: (target: T, p: string | symbol) => {
      if (p === "isDirty") {
        return dirty.size > 0;
      } else if (p === "dirtyProperties") {
        return [...dirty.values()];
      }
      const value = validator("get", p, target[p]);
      if (Array.isArray(value) || value instanceof Object) {
        return new Proxy(value, subProxier(p));
      }
      return value;
    }
  };
  return new Proxy(object, proxier);
}
