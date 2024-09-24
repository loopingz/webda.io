import { useContext } from "../hooks";
import { CoreModel } from "./coremodel";

/**
 * Proxied object
 */
export type Proxied<T> = T & { isDirty: boolean; dirtyProperties: (string | symbol)[] };

let contextUpdate: boolean = false;

export function setContextUpdate(value: boolean) {
  contextUpdate = value;
}

export function getContextUpdate(): boolean {
  return contextUpdate;
}
/**
 * Proxy an object to keep its state
 * @param object
 * @returns
 */
export function getProxy<T extends CoreModel>(object: T): Proxied<T> {
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
      object.attributePermission(property, undefined, "WRITE", object.context);
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
      } else if (p === "context") {
        target[p] = value;
        return true;
      }
      value = object.attributePermission(p, value, "WRITE", object.context);
      dirty.add(p);
      target[p] = value;
      return true;
    },
    get: (target: T, p: string | symbol) => {
      if (p === "isDirty") {
        return dirty.size > 0;
      } else if (p === "dirtyProperties") {
        return [...dirty.values()];
      } else if (p === "context") {
        return target[p];
      }
      const value = object.attributePermission(p, target[p], "READ", object.context);
      if (Array.isArray(value) || value instanceof Object) {
        return new Proxy(value, subProxier(p));
      }
      return value;
    }
  };
  return new Proxy(object, proxier);
}
