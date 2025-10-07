import { CryptoService } from "../services/cryptoservice";
import { JWTOptions } from "../services/icryptoservice";
import { Inject, Service } from "../services/service";

import { CookieOptions, SecureCookie } from "./cookie";
import { Context, isWebContext } from "../contexts/icontext";
import { getUuid } from "@webda/utils";
import { ServiceParameters } from "../services/serviceparameters";
import { Session } from "./session";
import { Repository, UuidModel } from "@webda/models";

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

export class SessionModel extends UuidModel {
  ttl: number;
  session: any;
  constructor(data: any) {
    super(data);
    this.ttl = data.ttl || 0;
    this.session = data.session || {};
  }
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

  load(params: any = {}): this {
    super.load(params);
    this.cookie = new CookieOptions(this.cookie || {});
    return this;
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
  sessionModel: Repository<typeof SessionModel>;

  /**
   * @override
   */
  async load(context: Context): Promise<Session> {
    if (!isWebContext(context)) {
      return new Session();
    }
    const session = new Session();
    const cookie = await SecureCookie.load(this.parameters.cookie.name, session, context, this.parameters.jwt);
    if (this.sessionModel) {
      if (cookie.sub) {
        Object.assign(session, (await this.sessionModel.get(cookie.sub))?.session);
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
    if (this.sessionModel) {
      if (this.sessionModel.exists(session.uuid)) {
        await this.sessionModel.update({
          uuid: session.uuid,
          session,
          ttl: Date.now() + this.parameters.cookie.maxAge * 1000
        });
      } else {
        await this.sessionModel.create({
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
