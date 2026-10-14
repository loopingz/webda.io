import { readFile } from "node:fs/promises";
import * as jose from "jose";
import { OIDCConfigurationError, OIDCTokenSourceError } from "../errors.js";
import { type SourcedToken, type TokenSource, toSourcedToken } from "./source.js";

/**
 * Token from a file, like a Kubernetes projected service account token
 *
 * The file is read again on every refresh: the kubelet rotates it. Its audience is fixed by the pod spec.
 */
export class FileTokenSource implements TokenSource {
  /**
   * @param path - the token file
   */
  constructor(protected path: string) {}

  /**
   * @override
   */
  async getToken(audience: string): Promise<SourcedToken> {
    let content: string;
    try {
      content = await readFile(this.path, "utf-8");
    } catch (err: any) {
      throw new OIDCTokenSourceError(`Cannot read the token file ${this.path}: ${err?.code ?? err?.message}`);
    }
    const sourced = toSourcedToken(content);
    const aud = jose.decodeJwt(sourced.token).aud;
    if (!(Array.isArray(aud) ? aud : [aud]).includes(audience)) {
      throw new OIDCConfigurationError(
        `The token file ${this.path} audience is not ${audience}: set it in the projected volume of the pod`
      );
    }
    return sourced;
  }
}
