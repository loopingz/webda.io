import { FileUtils } from "@webda/core";
import * as k8s from "@kubernetes/client-node";

/**
 * Parameters to initialize a Kubernetes client
 */
export interface KubernetesParameters {
  /**
   * Kubernetes configuration
   */
  config?: string | K8sConfiguration;
  /**
   * Default context to use
   */
  context?: string;
}

/**
 * Get a Kubernetes configuration initialized based on Kubernetes Parameters
 * @param params 
 * @returns 
 */
export function getKubeConfig(params: KubernetesParameters) : k8s.KubeConfig {
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
  return kc;
}

export interface K8sConfiguration {
    clusters: k8s.Cluster[];
    contexts: k8s.Context[];
    currentContext: string;
    users: k8s.User[];
}

/**
 *
 * @param params
 * @returns
 */
export function getKubernetesApiClient<T extends k8s.ApiType>(params: KubernetesParameters, api?: k8s.ApiConstructor<T>): T extends never ? k8s.KubernetesObjectApi : T {
  const kc = getKubeConfig(params);
  if (api) {
    return <any>kc.makeApiClient(api);
  } else {
    return <any>k8s.KubernetesObjectApi.makeApiClient(kc);
  }
}
