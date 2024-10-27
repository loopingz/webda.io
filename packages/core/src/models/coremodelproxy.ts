import { Proxied, IAttributeLevelPermissionModel } from "../internal/iapplication";

interface ProxyFilter {
  get: (target: any, prop: string | symbol) => any;
  set: (target: any, prop: string | symbol, value: any) => [any, boolean];
  deleteProperty: (target: any, prop: string | symbol) => boolean;
}

/**
 * Our dirty proxy is a proxy that keeps track of the changes made to the object
 *
 * It also allow properties: __class, __dirty, context
 *
 * @param filter
 * @returns
 */
export function getDirtyProxy<T extends object>(filter: ProxyFilter): (object: T) => T {
  return (object: T) => {
    const dirty = new Set<string | symbol>();
    //let context = useContext();
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
      deleteProperty: (target: T, property: string | symbol) => {
        if (property === "context") {
          return true;
        }
        if (!filter.deleteProperty(target, property)) {
          return false;
        }
        delete target[property];
        dirty.add(property);
        return true;
      },
      set: (target: T, p: string | symbol, value) => {
        if (p === "__dirty") {
          return true;
        } else if (p === "context") {
          target[<any>p] = value;
          return true;
        } else if (p === "__class") {
          target[p] = value;
          return true;
        }
        const [updatedValue, allowed] = filter.set(target, p, value);
        if (!allowed) {
          return false;
        }
        dirty.add(p);
        target[p] = updatedValue;
        return true;
      },
      get: (target: T, p: string | symbol) => {
        if (p === "__dirty") {
          return dirty;
        } else if (p === "context") {
          return target[p];
        } else if (p === "__class") {
          return target[p];
        }
        const value = filter.get(target, p);
        if (value instanceof Date) {
          return value;
        } else if (Array.isArray(value) || value instanceof Object) {
          return new Proxy(value, subProxier(p));
        }
        return value;
      }
    };
    return <T>new Proxy(object, proxier);
  };
}

/**
 * Proxy an object to keep its state
 * @param object
 * @returns
 */
export const getAttributeLevelProxy = getDirtyProxy({
  get: (target, p) => {
    return target.attributePermission(p, target[p], "READ");
  },
  set: (target, p, value) => {
    return [target.attributePermission(p, value, "WRITE"), true];
  },
  deleteProperty: (target, property) => {
    target.attributePermission(property, undefined, "WRITE");
    return true;
  }
});
/*
export function getAttributeLevelProxy<T extends IAttributeLevelPermissionModel>(object: T): Proxied<T> {
  const dirty = new Set<string | symbol>();
  //let context = useContext();
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
    deleteProperty: (target: T, property: string | symbol) => {
      if (property === "context") {
        return true;
      }
      if (target["context"] && target["context"].getCurrentUserId() !== "system") {
        object.attributePermission(property, undefined, "WRITE");
      }
      delete target[property];
      dirty.add(property);
      return true;
    },
    set: (target: T, p: string | symbol, value) => {
      if (p === "__dirty") {
        return true;
      } else if (p === "context") {
        target[<any>p] = value;
        return true;
      } else if (p === "__class") {
        target[p] = value;
        return true;
      }
      value =
        target["context"] && target["context"].getCurrentUserId() !== "system"
          ? object.attributePermission(<any>p, value, "WRITE")
          : value;
      dirty.add(p);
      target[p] = value;
      return true;
    },
    get: (target: T, p: string | symbol) => {
      if (p === "__dirty") {
        return dirty;
      } else if (p === "context") {
        return target[p];
      } else if (p === "__class") {
        return target[p];
      }
      const value =
        target["context"] && target["context"].getCurrentUserId() !== "system"
          ? object.attributePermission(p, target[p], "READ")
          : target[p];
      if (value instanceof Date) {
        return value;
      } else if (Array.isArray(value) || value instanceof Object) {
        return new Proxy(value, subProxier(p));
      }
      return value;
    }
  };
  return new Proxy(object, proxier);
}
*/
