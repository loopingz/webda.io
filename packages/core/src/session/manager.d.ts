import { CryptoService } from "../services/cryptoservice.js";
import { JWTOptions } from "../services/icryptoservice.js";
import { Service } from "../services/service.js";
import { CookieOptions } from "./cookie.js";
import { Context } from "../contexts/icontext.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Session } from "./session.js";
import { ModelClass, Repository, UuidModel } from "@webda/models";
/**
 * Manage load and save of sessions
 */
export declare abstract class SessionManager<T extends ServiceParameters = ServiceParameters> extends Service<T> {
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
export declare class SessionModel extends UuidModel {
    ttl: number;
    session: any;
    constructor(data: any);
}
export declare class CookieSessionParameters extends ServiceParameters {
    /**
     * Options for issue JWT token
     */
    jwt?: JWTOptions;
    /**
     * Cookie configuration for session
     */
    cookie?: CookieOptions;
    load(params?: any): this;
}
/**
 * SessionManager that store info in a cookie
 *
 * If SessionStore service exists, only uuid is in the cookie
 * the rest of data is stored within the session store
 *
 * @WebdaModda
 */
export declare class CookieSessionManager<T extends CookieSessionParameters = CookieSessionParameters> extends SessionManager<T> {
    cryptoService: CryptoService;
    sessionModel: Repository<ModelClass<SessionModel>>;
    /**
     * @override
     */
    load(context: Context): Promise<Session>;
    /**
     * @override
     */
    save(context: Context, session: Session): Promise<void>;
}
//# sourceMappingURL=manager.d.ts.map