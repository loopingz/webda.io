import { Service, Modda, ServiceParameters } from "@webda/core";
import * as AWSXRay from "aws-xray-sdk";

export class AWSXRayServiceParameters extends ServiceParameters {
  name: string;
}

@Modda
export default class AWSXRayService<T extends AWSXRayServiceParameters = AWSXRayServiceParameters> extends Service<T> {
  /**
   *
   * @param params
   */
  loadParameters(params: any) {
    return new AWSXRayServiceParameters(params);
  }

  launch() {
    // Depending on the OS
    // https://docs.aws.amazon.com/xray/latest/devguide/xray-daemon.html
  }

  resolve() {
    const getMethods = obj => {
      let properties = new Set();
      let currentObj = Object.getPrototypeOf(obj);
      do {
        Object.getOwnPropertyNames(currentObj)
          .filter(i => ["constructor", "on", "once"].indexOf(i) < 0)
          .forEach(item => properties.add(item));
      } while ((currentObj = Object.getPrototypeOf(currentObj)));
      // @ts-ignore
      return [...properties.keys()].filter(item => typeof obj[item] === "function");
    };
    this._webda.addListener("Webda.Init.Services", async services => {
      AWSXRay.captureAWS(require("aws-sdk"));
      AWSXRay.captureHTTPsGlobal(require("http"), true);
      AWSXRay.captureHTTPsGlobal(require("https"), true);

      for (let i in services) {
        this.log("TRACE", `X-Ray Patching ${services[i]._name}`);
        let methods: string[] = <any>getMethods(services[i]);
        for (let mi in methods) {
          let m: string = methods[mi];
          ((service, method) => {
            const name = `${services[service]._name}.${method}`;
            const originalMethod = services[service][method];
            services[service][method] = (...args) => {
              var subsegment = {
                close: () => {
                  // Do not do anything on close
                }
              };
              try {
                subsegment = AWSXRay.getSegment().addNewSubsegment(name);
              } catch (err) {
                // Ignore bad XRay to avoid getting in the way
              }
              let res = originalMethod.bind(services[service], ...args)();
              if (res instanceof Promise) {
                return res
                  .then(r => {
                    subsegment.close();
                    return r;
                  })
                  .catch(r => {
                    subsegment.close();
                    throw r;
                  });
              }
              subsegment.close();
              return res;
            };
          })(i, m);
        }
      }
    });
    this._webda.addListener("Webda.Request", async (ctx, ...args) => {
      var segment = new AWSXRay.Segment(
        this.parameters.name || this._webda.getApplication().getPackageDescription().name || "Webda.Request"
      );

      var ns = AWSXRay.getNamespace();
      const exec = ctx.execute.bind(ctx);
      // Dynamic replace the execute function
      ctx.execute = async () => {
        await ns.runPromise(async () => {
          AWSXRay.setSegment(segment);
          try {
            await exec();
          } finally {
            let http = ctx.getHttpContext();
            let url = http.getRelativeUri();

            // If it is a templated uri return the template for regroup
            if (ctx.getRoute()._uriTemplateParse) {
              url = ctx.getRoute()._uriTemplateParse.template;
            }
            if (ctx.getCurrentUserId()) {
              segment.setUser(ctx.getCurrentUserId());
            }
            segment.addIncomingRequestData({
              request: {
                method: http.getMethod(),
                user_agent: ctx.clientInfo.userAgent,
                client_ip: ctx.clientInfo.ip,
                url,
                x_forwarded_for: http.getHeader("x-forwarded-for")
              },
              // @ts-ignore
              response: {
                status: ctx.statusCode,
                content_length: ctx.getResponseBody().length
              }
            });
            segment.close();
          }
        });
      };
    });
  }
}

export { AWSXRayService };
