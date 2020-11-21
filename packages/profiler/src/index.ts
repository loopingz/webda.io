import { Service, ModdaDefinition, Context } from "@webda/core";

/**
 * Profiling service
 *
 * Mesure timing of each method and display them in TRACE
 */
export default class ProfilingService extends Service {
  /**
   * Return all methods from an object
   *
   * @param obj to return methods from
   */
  getMethods(obj) {
    let properties = new Set();
    let currentObj = Object.getPrototypeOf(obj);
    do {
      Object.getOwnPropertyNames(currentObj)
        .filter(i => ["constructor", "on", "once"].indexOf(i) < 0)
        .forEach(item => properties.add(item));
    } while ((currentObj = Object.getPrototypeOf(currentObj)));
    // @ts-ignore
    return [...properties.keys()].filter(item => typeof obj[item] === "function");
  }

  /**
   * Method to call before original function
   * @param {Service} service being patched
   * @param method method being patch
   */
  preprocessor(service: Service, method: string) {
    return {
      start: Date.now()
    };
  }

  /**
   * Method to call after original function
   * @param service being patched
   * @param method method being patch
   * @param data return by the preprocessor
   * @param err error thrown by the method if any
   */
  postprocessor(service: Service, method: string, data?: any, err?: any) {
    let duration = Date.now() - data.start;
    if (err) {
      this.log(`${service._name}.${method}: ${duration}ms - ERROR ${err}`);
    } else {
      this.log(`${service._name}.${method}: ${duration}ms`);
    }
  }

  /**
   * Log the performance
   * @param args
   */
  logMetrics(...args) {
    this.log("TRACE", ...args);
  }

  /**
   * Patch all services method: interlacing our pre/post processor
   */
  patchServices(services) {
    for (let i in services) {
      this.log("TRACE", `Profiling patching ${services[i]._name}`);
      let methods: string[] = <any>this.getMethods(services[i]);
      for (let mi in methods) {
        let m: string = methods[mi];
        ((service, method) => {
          const name = `${services[service]._name}.${method}`;
          const originalMethod = services[service][method];
          services[service][method] = (...args) => {
            let data = this.preprocessor(services[service], method);
            let res;
            try {
              res = originalMethod.bind(services[service], ...args)();
            } catch (err) {
              this.postprocessor(services[service], method, data, err);
              throw err;
            }
            if (res instanceof Promise) {
              return res
                .then(r => {
                  this.postprocessor(services[service], method, data);
                  return r;
                })
                .catch(r => {
                  this.postprocessor(services[service], method, data, r);
                  throw r;
                });
            }
            this.postprocessor(services[service], method, data);
            return res;
          };
        })(i, m);
      }
    }
  }

  /**
   * Return if Profiler is enable
   */
  isEnabled() {
    return !this._params.disabled;
  }

  /**
   * Instrument Request to display request duration in ms
   *
   * @param {Context} request to instrument
   * @param {any[]}
   */
  instrumentRequest(ctx: Context, ...args: any[]) {
    const exec = ctx.execute.bind(ctx);
    // Dynamic replace the execute functionc
    ctx.execute = async () => {
      let start = Date.now();
      let error;
      try {
        await exec();
      } catch (err) {
        error = err;
        throw err;
      } finally {
        if (error) {
          this.log("TRACE", `Request took ${Date.now() - start}ms with error '${error.message}'`);
        } else {
          this.log("TRACE", `Request took ${Date.now() - start}ms`);
        }
      }
    };
  }

  /**
   * Add listeners on `Webda.Init.Services` and `Webda.Request`
   */
  resolve() {
    if (!this.isEnabled()) {
      return;
    }
    this._webda.addListener("Webda.Init.Services", async services => {
      this.patchServices(services);
    });
    this._webda.addListener("Webda.Request", async (ctx, ...args) => {
      if (!this.isEnabled()) {
        return;
      }
      this.instrumentRequest(ctx, ...args);
    });
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/Profiler",
      label: "Profiler",
      description: "Implements basic profiler",
      logo: "images/icons/dynamodb.png",
      documentation: "https://raw.githubusercontent.com/loopingz/webda.io/master/readmes/Profiler.md",
      configuration: {}
    };
  }
}

export { ProfilingService };
