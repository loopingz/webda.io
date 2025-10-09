import { useLog } from "../loggers/hooks.js";

/**
 * Interface to specify the Service parameters
 */
export class ServiceParameters {
  /**
   * Type of the service
   */
  type: string;
  /**
   * Watch for changes on the parameters and call watchers when a parameter is changed
   */
  private watchers: {
    props: string[];
    callback: (params: any) => void;
  }[] = [];

  load(params: any = {}): this {
    Object.assign(this, params);
    return this;
  }

  /**
   * Update parameters and call watchers if a parameter was changed
   * @param params
   * @param delta
   * @returns
   */
  update(params: any = {}, delta: any): this {
    this.load(params);
    // Check delta to call watchers
    for (const watcher of this.watchers) {
      if (watcher.props.some(p => p in delta)) {
        watcher.callback(this);
      }
    }
    return this;
  }

  /**
   * Watch for changes on the parameters and call watchers when a parameter is changed
   * @param callback
   * @returns
   */
  with(callback: (params: this) => void): this {
    const watchers = [];
    const proxy = new Proxy(this, {
      get: (target, prop) => {
        if (!watchers.includes(prop)) {
          watchers.push(prop);
        }
        return target[prop as keyof this];
      }
    });
    callback(proxy);
    // If properties were accessed, add the watcher
    if (watchers.length) {
      this.watchers.push({ props: watchers, callback });
    } else {
      useLog("WARN", "ServiceParameters.with: No properties accessed in callback");
    }
    return this;
  }
}
