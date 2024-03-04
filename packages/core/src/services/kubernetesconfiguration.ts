import * as fs from "fs";
import * as path from "path";
import { ServiceParameters, WebdaError } from "../index";
import { FileUtils } from "../utils/serializers";
import { ConfigurationService, ConfigurationServiceParameters } from "./configuration";

/**
 * Allow for dynamic configuration from ConfigMap or Secrets
 *
 * Read a ConfigMap from Kubernetes and auto-update
 * @WebdaModda
 */
export class KubernetesConfigurationService<T extends ConfigurationServiceParameters> extends ConfigurationService<T> {
  /**
   * @override
   */
  loadParameters(params: any): ServiceParameters {
    let res = new ConfigurationServiceParameters(params);
    // Do not call super as we diverged
    if (!res.source) {
      throw new WebdaError.CodeError(
        "KUBE_CONFIGURATION_SOURCE_MISSING",
        "Need a source for KubernetesConfigurationService"
      );
    }
    res.source = this.webda.getAppPath(res.source);
    if (!fs.existsSync(res.source)) {
      throw new WebdaError.CodeError(
        "KUBE_CONFIGURATION_SOURCE_MISSING",
        "Need a source for KubernetesConfigurationService"
      );
    }
    return res;
  }

  /**
   * @ignore
   */
  async init(): Promise<this> {
    // Add webda info
    this.watch("$.services", (updates: any) => this._webda.reinit(updates));

    fs.watchFile(path.join(this.parameters.source, "..data"), this.checkUpdate.bind(this));
    await this.checkUpdate();
    return this;
  }

  /**
   * Read the file and store it
   */
  async initConfiguration(): Promise<{ [key: string]: any }> {
    return this.loadAndStoreConfiguration();
  }

  /**
   * Load configuration from a ConfigMap or a Secret
   * @override
   */
  async loadConfiguration(): Promise<{ [key: string]: any }> {
    let result = {};
    const found = fs
      .readdirSync(this.parameters.source)
      .filter(f => !f.startsWith(".") && f.match(/webda\.(jsonc?|ya?ml)$/i))
      .pop();
    if (!found) {
      return this.parameters.default;
    }
    this.log("TRACE", "loadConfiguration", result);
    return FileUtils.load(path.join(this.parameters.source, found));
  }
}
