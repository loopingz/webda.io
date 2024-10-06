import { CryptoService } from "../services/cryptoservice";
import { JWTOptions } from "../services/icryptoservice";
import { type DeepPartial, Inject, Service } from "../services/service";
import { Store } from "../stores/store";

import { CookieOptions, SecureCookie } from "./cookie";
import { Context } from "../contexts/context";
import { getUuid } from "../utils/uuid";
import { isWebContext } from "../interfaces";
import { ServiceParameters } from "../services/iservices";
import { Session } from "./session";

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
  sessionStore: Store;

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
    if (!isWebContext(context)) {
      return new Session();
    }
    const session = new Session();
    const cookie = await SecureCookie.load(this.parameters.cookie.name, session, context, this.parameters.jwt);
    if (this.sessionStore) {
      if (cookie.sub) {
        Object.assign(session, (await this.sessionStore.get(cookie.sub))?.session);
        session.uuid = cookie.sub;
      }
      session.uuid ??= getUuid("base64");
    } else {
      Object.assign(session, cookie);
    }
    return session;
  }

  /**
   * @override
   */
  async save(context: Context, session: Session) {
    if (!isWebContext(context)) {
      return;
    }
    // If store is found session info are stored in db
    if (this.sessionStore) {
      if (this.sessionStore.exists(session.uuid)) {
        await this.sessionStore.update(session.uuid, {
          uuid: session.uuid,
          session,
          ttl: Date.now() + this.parameters.cookie.maxAge * 1000
        });
      } else {
        await this.sessionStore.create(session.uuid, {
          uuid: session.uuid,
          session,
          ttl: Date.now() + this.parameters.cookie.maxAge * 1000
        });
      }
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
