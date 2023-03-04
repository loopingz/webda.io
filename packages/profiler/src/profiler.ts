import { LoggerService, Service, ServiceParameters, WebContext } from "@webda/core";

/**
 * Profiler Parameters
 */
export class ProfilerParameters extends ServiceParameters {
  /**
   * Disable the service
   */
  disabled?: boolean;

  /**
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    this.disabled ??= false;
  }
}
/**
 * Profiling service
 *
 * Mesure timing of each method and display them in TRACE
 *
 * @WebdaModda
 */
export default class Profiler<T extends ProfilerParameters = ProfilerParameters> extends Service<T> {
  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new ProfilerParameters(params);
  }
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
    return [...properties.keys()].filter((item: string | symbol) => typeof obj[item] === "function");
  }

  /**
   * Method to call before original function
   * @param {Service} service being patched
   * @param method method being patch
   */
  preprocessor(_service: Service, _method: string) {
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
      this.logMetrics(`${service.getName()}.${method}: ${duration}ms - ERROR ${err}`);
    } else {
      this.logMetrics(`${service.getName()}.${method}: ${duration}ms`);
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
   * Return true if the service should not be instrumentalized
   * Logger service are excluded
   *
   * @param service to check
   */
  excludeService(service: Service): boolean {
    return service instanceof LoggerService || service instanceof Profiler || this === service;
  }
  /**
   * Patch all services method: interlacing our pre/post processor
   */
  patchServices(services) {
    for (let i in services) {
      // Check if service is excluded
      if (this.excludeService(services[i])) {
        continue;
      }
      this.log("TRACE", `Profiling patching ${services[i]._name}`);
      let methods: string[] = <any>this.getMethods(services[i]);
      for (let mi in methods) {
        let m: string = methods[mi];
        // Skip getName as we use it
        if (["getName"].includes(m)) {
          continue;
        }
        ((service, method) => {
          const originalMethod = services[service][method];
          services[service][method] = (...args) => {
            if (!this.isEnabled()) {
              return originalMethod.bind(services[service], ...args)();
            }
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
                  this.postprocessor(services[service], method, data, r.message);
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
    return !this.parameters.disabled;
  }

  /**
   * Instrument Request to display request duration in ms
   *
   * @param {Context} request to instrument
   * @param {any[]}
   */
  instrumentRequest(ctx: WebContext, ..._args: any[]) {
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
          this.logMetrics(`Request took ${Date.now() - start}ms - ERROR ${error.message}`);
        } else {
          this.logMetrics(`Request took ${Date.now() - start}ms`);
        }
      }
    };
  }

  /**
   * Add listeners on `Webda.Init.Services` and `Webda.Request`
   */
  resolve(): this {
    this._webda.on("Webda.Init.Services", async services => {
      this.patchServices(services);
    });
    this._webda.on("Webda.Request", evt => {
      if (!this.isEnabled()) {
        return;
      }
      this.instrumentRequest(evt.context);
    });
    return this;
  }
}

export { Profiler };
