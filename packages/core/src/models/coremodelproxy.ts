import { Proxied } from "../application/iapplication";
import { IAttributeLevelPermissionModel } from "./imodel";

/**
 * Proxy an object to keep its state
 * @param object
 * @returns
 */
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
    deleteProperty: (t, property) => {
      if (property === "context") {
        return true;
      }
      object.attributePermission(property, undefined, "WRITE");
      delete t[property];
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
      value = object.attributePermission(<any>p, value, "WRITE");
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
      const value = object.attributePermission(p, target[p], "READ");
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
