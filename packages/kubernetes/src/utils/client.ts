import { FileUtils } from "@webda/core";
import * as k8s from "@kubernetes/client-node";

/**
 * Parameters to initialize a Kubernetes client
 */
export interface KubernetesParameters {
  /**
   * Kubernetes configuration
   */
  config?: string | Object;
  /**
   * Default context to use
   */
  context?: string;
}

/**
 *
 * @param params
 * @returns
 */
export function getKubernetesApiClient(params: KubernetesParameters, api?: any): k8s.ApiType | k8s.KubernetesObjectApi {
  const kc = new k8s.KubeConfig();
  // Load all type of configuration
  if (params.config) {
    if (typeof params.config === "string") {
      kc.loadFromOptions(FileUtils.load(params.config));
    } else {
      kc.loadFromOptions(params.config);
    }
  } else {
    kc.loadFromDefault();
  }
  if (params.context) {
    kc.setCurrentContext(params.context);
  }
  if (api) {
    return kc.makeApiClient(api);
  } else {
    return k8s.KubernetesObjectApi.makeApiClient(kc);
  }
}
