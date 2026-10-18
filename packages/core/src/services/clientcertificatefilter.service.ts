import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import type { RequestFilter } from "../rest/irest.js";
import type { IWebContext } from "../contexts/icontext.js";

/** ClientCertificateFilter parameters */
export class ClientCertificateFilterParameters extends ServiceParameters {
  /**
   * Regular expressions of the request paths (relative uri without query string) allowed with a verified client
   * certificate, undefined allows every path
   */
  paths?: string[];

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    if (typeof params.paths === "string") {
      this.paths = [params.paths];
    }
    return this;
  }
}

/**
 * Request filter allowing the requests presenting a verified TLS client certificate (mTLS)
 *
 * Request filters are combined with OR: a request is allowed when any filter allows it. With this filter alone, only
 * the requests with a verified client certificate on `paths` are allowed.
 *
 * @WebdaModda
 */
export class ClientCertificateFilter<T extends ClientCertificateFilterParameters = ClientCertificateFilterParameters>
  extends Service<T>
  implements RequestFilter<IWebContext>
{
  static Parameters = ClientCertificateFilterParameters;

  /** Compiled `paths` */
  protected patterns?: RegExp[];

  /** @override */
  resolve(): this {
    super.resolve();
    this.patterns = this.parameters.paths?.map(p => new RegExp(p));
    return this;
  }

  /**
   * Allow the request when it presents a verified client certificate on an allowed path
   * @param context - the request context
   * @returns true when allowed
   */
  async checkRequest(context: IWebContext): Promise<boolean> {
    const http = context.getHttpContext();
    if (!http?.getClientCertificate?.()?.verified) {
      return false;
    }
    const patterns = (this.patterns ??= this.parameters.paths?.map(p => new RegExp(p)));
    if (!patterns) {
      return true;
    }
    const path = http.getRelativeUri().split("?")[0];
    return patterns.some(p => p.test(path));
  }
}
