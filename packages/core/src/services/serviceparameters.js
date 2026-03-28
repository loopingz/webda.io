import { useLog } from "../loggers/hooks.js";
/**
 * Interface to specify the Service parameters
 */
export class ServiceParameters {
    constructor() {
        /**
         * Watch for changes on the parameters and call watchers when a parameter is changed
         */
        this.watchers = [];
    }
    load(params = {}) {
        Object.assign(this, params);
        return this;
    }
    /**
     * Update parameters and call watchers if a parameter was changed
     * @param params
     * @param delta
     * @returns
     */
    update(params = {}, delta) {
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
                        return target[prop];
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
    with(callback) {
        const watchers = [];
        const proxy = new Proxy(this, {
            get: (target, prop) => {
                if (!watchers.includes(prop)) {
                    watchers.push(prop);
                }
                return target[prop];
            }
        });
        callback(proxy);
        // If properties were accessed, add the watcher
        if (watchers.length) {
            this.watchers.push({ props: watchers, callback });
        }
        else {
            useLog("WARN", "ServiceParameters.with: No properties accessed in callback");
        }
        return this;
    }
}
//# sourceMappingURL=serviceparameters.js.map