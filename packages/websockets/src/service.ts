import { CoreModel, DeepPartial, Service, ServiceParameters } from "@webda/core";
import { createHmac } from "crypto";
import { StoreListener } from "./storelistener";
 
export class WebSocketsParameters extends ServiceParameters {
  /**
   * @default {type: "JWT"}
   */
  auth?: {
    type: "HMAC",
    secret: string
  } | { type: "JWT" };

  constructor(params: any) {
    super(params);
    this.auth ??= {type: "JWT"}
  }
}

const TOKEN_TIMEOUT = 30000;
export abstract class WSService<T extends WebSocketsParameters = WebSocketsParameters> extends Service<T> {
  storeListeners: {
    [key: string]: StoreListener;
  } = {};
  usedTokens: Set<string> = new Set<string>();
  protected abstract _sendModelEvent(fullUuid: string, type: string, evt: any): Promise<void>;

  /**
   * Send a model event if somebody is listening
   * @param fullUuid
   * @param type
   * @param evt
   */
  async sendModelEvent(fullUuid: string | CoreModel, type: string, evt: any): Promise<void> {
    if (this.hasRoom(fullUuid)) {
      this._sendModelEvent(fullUuid instanceof CoreModel ? fullUuid.getFullUuid() : fullUuid, type, evt);
    }
  }

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): WebSocketsParameters {
    return new WebSocketsParameters(params);
  }

  /**
   * Get the authentication token
   */
  async getAuthToken() : Promise<string> {
    let data = Date.now().toString();
    if (this.parameters.auth.type === "HMAC") {
      return `${data}:${createHmac("sha256", this.parameters.auth.secret).update(data).digest('hex')}`;
    } else if (this.parameters.auth.type === "JWT") {
      return this.getWebda().getCrypto().jwtSign({timeout: data}, {
        expiresIn: "30000"
      });
    }
  }

  /**
   * Verify the JWT token
   * @param token 
   * @returns 
   */
  async verifyAuthToken(token: string): Promise<boolean> {
    let result: boolean = false;
    if (this.usedTokens.has(token)) {
      return false;
    }
    if (this.parameters.auth.type === "HMAC") {
      const [timeout, hmac ] = token.split(":");
      if (parseInt(timeout) < Date.now() - TOKEN_TIMEOUT || this.usedTokens.has(token)) {
        return false;
      }
      result = createHmac("sha256", this.parameters.auth.secret).update(timeout).digest('hex') === hmac;
    } else if (this.parameters.auth.type === "JWT") {
      result = await this.getWebda().getCrypto().jwtVerify(token); 
    }
    if (result) {
      this.usedTokens.add(token);
      setTimeout(() => {
        /* c8 ignore next */
        this.usedTokens.delete(token);
      }, TOKEN_TIMEOUT)
    }
    return result;
  }

  /**
   * Register room
   * @param room
   */
  registerRoom(room: string) {
    const [storeName, uuid] = room.substring("model_".length).split("$");
    this.storeListeners[storeName] ??= new StoreListener(this.getService(storeName), this);
    this.storeListeners[storeName].register(uuid);
  }

  /**
   * Return if the room exists
   *
   * @param fullUuid
   * @returns
   */
  hasRoom(fullUuid: string | CoreModel) {
    const [storeName, uuid] = (fullUuid instanceof CoreModel ? fullUuid.getFullUuid() : fullUuid).split("$");
    return this.storeListeners[storeName] && this.storeListeners[storeName].uuids.has(uuid);
  }

  /**
   * Unregister room
   * @param room
   */
  unregisterRoom(room: string) {
    let [storeName, uuid] = room.substring("model_".length).split("$");
    const listener = this.storeListeners[storeName];
    if (listener.unregister(uuid)) {
      delete this.storeListeners[storeName];
    }
  }
}
