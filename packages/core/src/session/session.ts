import { NotEnumerable } from "@webda/tsc-esm";

/**
 * Session
 */
export class Session {
  @NotEnumerable
  protected changed: boolean = false;
  /**
   * Session uuid
   */
  uuid: string;
  /**
   * User id
   */
  userId: string;
  /**
   * Ident used
   */
  identUsed: string;

  /**
   * User current roles
   */
  roles: string[];

  /**
   * Login
   * @param userId
   * @param identUsed
   */
  login(userId: string, identUsed: string) {
    this.userId = userId;
    this.identUsed = identUsed;
  }
  /**
   * Logout
   */
  logout() {
    delete this.userId;
    delete this.identUsed;
    delete this.roles;
  }

  /**
   * If session is authenticated
   */
  isLogged(): boolean {
    return this.userId !== undefined;
  }

  /**
   * Session is dirty and requires save
   * @returns
   */
  isDirty(): boolean {
    return this.changed;
  }

  /**
   * Get the proxy to be able to track modification
   * @returns
   */
  getProxy(): this {
    const proxyHandler = {
      set: (obj: this, property: string, value: any) => {
        this.changed = true;
        obj[property] = value;
        return true;
      },
      get: (obj: this, property: string) => {
        if (typeof obj[property] === "object") {
          return new Proxy(obj[property], proxyHandler);
        }
        return obj[property];
      }
    };
    return new Proxy(this, proxyHandler);
  }
}

/**
 * Unknown session that allows all keys
 */
export class UnknownSession extends Session {
  /**
   * Allow any type of fields
   */
  [key: string]: any;
}
