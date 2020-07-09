import { Service } from "./service";
import { WebdaError } from "../core";
import * as jsonpath from "jsonpath";

interface ConfigurationProvider {
  getConfiguration(id: string): Promise<Map<string, any>>;
  canTriggerConfiguration(id: string, callback: () => void): boolean;
}

/**
 * Handle sessionSecret ( rolling between two secrets ) expire every hour
 * Handle longTermSecret ( rolling between two longer secret ) expire every month
 * @category CoreServices
 */
export default class ConfigurationService extends Service {
  protected _configuration: any;
  protected _nextCheck: number;
  protected _sourceService: any;
  protected _sourceId: string;
  private _interval: NodeJS.Timer | number;
  protected watches: any[] = [];
  protected configuration: any;

  async init() {
    // Check interval by default every hour
    if (!this._params.checkInterval) {
      this._params.checkInterval = 3600;
    }

    if (!this._params.source) {
      throw new WebdaError("CONFIGURATION_SOURCE_MISSING", "Need a source for ConfigurationService");
    }
    let source = this._params.source.split(":");
    this._sourceService = this.getService(source[0]);
    if (!this._sourceService) {
      throw new WebdaError(
        "CONFIGURATION_SOURCE_INVALID",
        'Need a valid service for source ("sourceService:sourceId")'
      );
    }
    this._sourceId = source[1];
    if (!this._sourceId) {
      throw new WebdaError("CONFIGURATION_SOURCE_INVALID", 'Need a valid source ("sourceService:sourceId")');
    }
    if (!this._sourceService.getConfiguration) {
      throw new WebdaError(
        "CONFIGURATION_SOURCE_INVALID",
        `Service ${source[0]} is not implementing ConfigurationProvider interface`
      );
    }
    this._configuration = JSON.stringify(this._params.default);
    await this._checkUpdate();
    if (!this._sourceService.canTriggerConfiguration(this._sourceId, this._checkUpdate.bind(this))) {
      this._interval = setInterval(this._checkUpdate.bind(this), 1000);
    }

    // Add webda info
    this.watch("$.webda.services", this._webda.reinit.bind(this._webda));
  }

  watch(path: string, callback: (update: any) => void | Promise<void>, defaultValue: any = undefined) {
    this.watches.push({ path, callback, defaultValue });
  }

  stop() {
    // @ts-ignore
    clearInterval(this._interval);
  }

  getConfiguration() {
    return this.configuration || {};
  }

  async reinit(config: any): Promise<void> {
    // Need to prevent any reinit
  }

  async _loadConfiguration(): Promise<{ [key: string]: any }> {
    return this._sourceService.getConfiguration(this._sourceId);
  }

  async _checkUpdate() {
    // If the ConfigurationProvider cannot trigger we check at interval
    if (this._interval && this._nextCheck > new Date().getTime()) return;

    this.log("DEBUG", "Refreshing configuration");
    let newConfig = (await this._loadConfiguration()) || this._params.default;
    if (JSON.stringify(newConfig) !== this._configuration) {
      this.emit("Configuration.Applying");
      this.log("DEBUG", "Apply new configuration");
      this._configuration = JSON.stringify(newConfig);
      this.configuration = newConfig;
      let promises = [];
      this.watches.forEach(w => {
        this.log("TRACE", "Apply new configuration value", jsonpath.query(newConfig, w.path).pop() || w.defaultValue);
        let p = w.callback(jsonpath.query(newConfig, w.path).pop() || w.defaultValue);
        if (p) {
          promises.push(p);
        }
      });
      await Promise.all(promises);
      this.emit("Configuration.Applied");
    }
    // If the ConfigurationProvider cannot trigger we check at interval
    if (this._interval) {
      this._updateNextCheck();
      this.log("DEBUG", "Next configuration refresh in", this._params.checkInterval, "s");
    }
  }

  _updateNextCheck() {
    this._nextCheck = new Date().getTime() + this._params.checkInterval * 1000;
  }
}

export { ConfigurationProvider, ConfigurationService };
