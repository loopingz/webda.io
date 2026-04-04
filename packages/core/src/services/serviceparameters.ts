import { useLog } from "@webda/workout";

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
        const watchers = [];
        const proxy = new Proxy(this, {
          get: (target, prop) => {
            if (!watchers.includes(prop)) {
              watchers.push(prop);
            }
            return target[prop as keyof this];
          }
        });
        // We need to call the watcher with another proxy
        watcher.callback(proxy);
        // Update the watcher props if they accessed new properties
        if (watchers.length) {
          watcher.props = Array.from(new Set([...watcher.props, ...watchers]));
        }
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
