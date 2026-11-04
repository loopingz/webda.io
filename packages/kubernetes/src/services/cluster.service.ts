import * as k8s from "@kubernetes/client-node";
import { ClusterService, ClusterServiceParameters } from "@webda/core";
import { existsSync, readFileSync } from "node:fs";
import { LeaderElector } from "../operator/leader.js";
import { getKubernetesApiClient, K8sConfiguration, KubernetesParameters } from "../utils/client.js";

/** Namespace file of the pod's service account */
const SERVICE_ACCOUNT_NAMESPACE = "/var/run/secrets/kubernetes.io/serviceaccount/namespace";

/** KubernetesClusterService parameters */
export class KubernetesClusterServiceParameters extends ClusterServiceParameters implements KubernetesParameters {
  /**
   * Kubernetes configuration, the pod's service account or the local kubeconfig when unset
   *
   * Can be encrypted with `webda config encrypt`
   * @secret users.token,users.password,users.keyData,users.authProvider
   */
  config?: string | K8sConfiguration;
  /**
   * Kubernetes context to use
   */
  context?: string;
  /**
   * Milliseconds before a request to the Kubernetes API is aborted, no timeout when unset
   */
  timeout?: number;
  /**
   * Namespace of the Lease, defaults to `POD_NAMESPACE`, else the namespace of the pod's service account, else
   * `default`
   */
  namespace?: string;

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.namespace ??=
      process.env.POD_NAMESPACE ||
      (existsSync(SERVICE_ACCOUNT_NAMESPACE) ? readFileSync(SERVICE_ACCOUNT_NAMESPACE, "utf-8").trim() : undefined) ||
      "default";
    return this;
  }
}

/**
 * Leader election on a `coordination.k8s.io` Lease named `leaseName`
 *
 * The service account needs `get`, `create` and `update` on `leases` in the namespace.
 *
 * @WebdaModda
 */
export class KubernetesClusterService<
  T extends KubernetesClusterServiceParameters = KubernetesClusterServiceParameters
> extends ClusterService<T> {
  static Parameters = KubernetesClusterServiceParameters;

  /** Lease logic, the election loop is the one of ClusterService */
  protected elector?: LeaderElector;

  /**
   * @returns the elector of the lease
   */
  protected getElector(): LeaderElector {
    this.elector ??= new LeaderElector(
      getKubernetesApiClient(this.parameters, k8s.CoordinationV1Api),
      {
        name: this.parameters.leaseName,
        namespace: this.parameters.namespace ?? "default",
        identity: this.getInstanceId(),
        leaseDuration: this.parameters.leaseDuration,
        retryPeriod: this.parameters.renewInterval
      },
      // Unused: ClusterService runs the election loop and the callbacks
      { onStartedLeading: () => {}, onStoppedLeading: () => {} }
    );
    return this.elector;
  }

  /** @override */
  protected acquireOrRenew(): Promise<boolean> {
    return this.getElector().tryAcquireOrRenew();
  }

  /** @override */
  protected release(): Promise<void> {
    return this.getElector().release();
  }
}
