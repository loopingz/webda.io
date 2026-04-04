import { StoreParameters } from "@webda/core";
import { K8sConfiguration, KubernetesParameters } from "../utils/client";

export class KubernetesSecretsStoreParameters extends StoreParameters implements KubernetesParameters {
  /**
   * Kubernetes configuration
   */
  config?: string | K8sConfiguration;
  /**
   * Default context to use
   */
  context?: string;
  /**
   * Namespace to use
   */
  namespace: string;
}
