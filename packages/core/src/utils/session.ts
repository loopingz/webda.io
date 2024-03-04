import { DeepPartial, NotEnumerable } from "@webda/tsc-esm";
import { Core } from "../core";
import { CoreModel } from "../models/coremodel";
import CryptoService, { JWTOptions } from "../services/cryptoservice";
import { Inject, Service, ServiceParameters } from "../services/service";
import { Store } from "../stores/store";
import { Context, OperationContext, WebContext } from "./context";
import { CookieOptions, SecureCookie } from "./cookie";

/**
 * Manage load and save of sessions
 */
export abstract class SessionManager<T extends ServiceParameters = ServiceParameters> extends Service<T> {
  /**
   * Load a session based on context
   * @param context
   */
  abstract load(context: Context): Promise<Session>;
  /**
   * Save the session within the context
   * @param context
   * @param session
   */
  abstract save(context: Context, session: Session): Promise<void>;
  /**
   * Create a new session
   */
  abstract newSession(context: Context): Promise<Session>;
}

export class CookieSessionParameters extends ServiceParameters {
  /**
   * Options for issue JWT token
   */
  jwt?: JWTOptions;
  /**
   * Cookie configuration for session
   */
  cookie?: CookieOptions;

  constructor(params: any) {
    super(params);
    this.cookie ??= new CookieOptions(params.cookie || {});
  }
}

/**
 * SessionManager that store info in a cookie
 *
 * If SessionStore service exists, only uuid is in the cookie
 * the rest of data is stored within the session store
 *
 * @WebdaModda
 */
export class CookieSessionManager<
  T extends CookieSessionParameters = CookieSessionParameters
> extends SessionManager<T> {
  @Inject("CryptoService")
  cryptoService: CryptoService;

  @Inject("SessionStore", true)
  sessionStore: Store<CoreModel & { session: any }>;

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): ServiceParameters {
    return new CookieSessionParameters(params);
  }

  /**
   * @override
   */
  async load(context: Context): Promise<Session> {
    if (!(context instanceof WebContext)) {
      return new Session();
    }
    let session = new Session();
    let cookie = await SecureCookie.load(this.parameters.cookie.name, context, this.parameters.jwt);
    if (this.sessionStore) {
      if (cookie.sub) {
        session = await Session.ref(cookie.sub).get();
      }
      session.uuid ??= Core.get().getUuid("base64");
    } else {
      Object.assign(session, cookie);
    }
    return session;
  }

  /**
   * @override
   */
  async newSession(context: OperationContext<any, any>) {
    return new Session();
  }

  /**
   * @override
   */
  async save(context: Context, session: Session) {
    if (!(context instanceof WebContext)) {
      return;
    }
    // If store is found session info are stored in db
    if (this.sessionStore) {
      session.ttl = Date.now() + this.parameters.cookie.maxAge * 1000;
      await session.save();
      SecureCookie.save(
        this.parameters.cookie.name,
        context,
        {},
        { ...this.parameters.jwt, subject: session.uuid.toString() },
        this.parameters.cookie
      );
      return;
    }
    SecureCookie.save(this.parameters.cookie.name, context, session, this.parameters.jwt, this.parameters.cookie);
  }
}

/**
 * Session
 */
export class Session extends CoreModel {
  @NotEnumerable
  protected changed: boolean = false;
  /**
   * Session uuid
   */
  uuid: string;
  /**
   * Session time to live
   */
  ttl: number;
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
