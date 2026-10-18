import * as k8s from "@kubernetes/client-node";
import { SecretString } from "@webda/core";
import { FileUtils } from "@webda/utils";

/**
 * Parameters to initialize a Kubernetes client
 */
export interface KubernetesParameters {
  /**
   * Kubernetes configuration
   *
   * Can be encrypted with `webda config encrypt`
   * @secret users.token,users.password,users.keyData,users.authProvider
   */
  config?: string | K8sConfiguration;
  /**
   * Default context to use
   */
  context?: string;
}

/**
 * Get a Kubernetes configuration initialized based on Kubernetes Parameters
 * @param params - the kubernetes parameters
 * @returns the kubernetes configuration
 */
export function getKubeConfig(params: KubernetesParameters): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  // Load all type of configuration
  // Encrypted values (tokens, keys) are replaced by their plain value
  const config = SecretString.unwrap(params.config);
  if (config) {
    if (typeof config === "string") {
      kc.loadFromOptions(FileUtils.load(config));
    } else {
      kc.loadFromOptions(config);
    }
  } else {
    kc.loadFromDefault();
  }
  if (params.context) {
    kc.setCurrentContext(params.context);
  }
  return kc;
}

/**
 * Kubernetes configuration as found in a kubeconfig file
 */
export interface K8sConfiguration {
  clusters: k8s.Cluster[];
  contexts: k8s.Context[];
  currentContext: string;
  users: k8s.User[];
}

/**
 * Get a Kubernetes API client
 * @param params - the kubernetes parameters
 * @param api - the API class to instantiate, generic object API if not specified
 * @returns the API client
 */
export function getKubernetesApiClient(params: KubernetesParameters, api?: any): k8s.ApiType | k8s.KubernetesObjectApi {
  const kc = getKubeConfig(params);
  if (api) {
    return kc.makeApiClient(api);
  } else {
    return k8s.KubernetesObjectApi.makeApiClient(kc);
  }
}
