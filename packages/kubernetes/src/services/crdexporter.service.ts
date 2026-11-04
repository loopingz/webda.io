import * as k8s from "@kubernetes/client-node";
import { Command, Service, useCore } from "@webda/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRbac, RbacGrant } from "../crd/rbac.js";
import { KubernetesOperator } from "../operator/operator.service.js";
import { KubernetesStore, toTypedCrd } from "../stores/kubernetesstore.service.js";

/**
 * Export the CustomResourceDefinitions of the Kubernetes stores and the RBAC rules they and the operators need
 *
 * Exposes the `webda kubernetes crd export` and `webda kubernetes rbac export` commands
 *
 * @WebdaModda
 */
export default class KubernetesCrdExporter extends Service {
  /**
   * Write one CustomResourceDefinition per model of every Kubernetes store
   *
   * @param target - Folder to write the definitions to, as `<plural>.<group>.yaml`
   */
  @Command("kubernetes crd export", {
    description: "Export the CustomResourceDefinitions of the Kubernetes stores",
    requires: ["kubernetes-crd-export"],
    phase: "resolved"
  })
  async crdExport(target: string = "./crds"): Promise<void> {
    mkdirSync(target, { recursive: true });
    const exported = new Map<string, { store: string; content: string }>();
    for (const service of Object.values(useCore().getServices())) {
      if (!(service instanceof KubernetesStore)) continue;
      for (const crd of service.getCrds()) {
        const content = k8s.dumpYaml(toTypedCrd(crd));
        const previous = exported.get(crd.metadata.name);
        if (previous && previous.content !== content) {
          throw new Error(
            `The stores ${previous.store} and ${service.getName()} define ${crd.metadata.name} differently`
          );
        }
        exported.set(crd.metadata.name, { store: service.getName(), content });
      }
    }
    for (const [name, { content }] of exported) {
      const filename = join(target, `${name}.yaml`);
      this.log("DEBUG", `Exporting ${filename}`);
      writeFileSync(filename, content);
    }
    // The count is logged, not returned: a command result is its exit code
    this.log("INFO", `Exported ${exported.size} CustomResourceDefinitions`);
  }

  /**
   * Write the Roles, ClusterRole and bindings the Kubernetes stores and operators need
   *
   * @param target - File to write the manifests to
   * @param serviceAccount - Service account running the application
   * @param serviceAccountNamespace - Namespace of the service account
   * @param name - Name of the Roles, ClusterRole and bindings
   */
  @Command("kubernetes rbac export", {
    description: "Export the RBAC rules of the Kubernetes stores and operators",
    requires: ["kubernetes-crd-export"],
    phase: "resolved"
  })
  async rbacExport(
    target: string = "./rbac.yaml",
    serviceAccount: string = "default",
    serviceAccountNamespace: string = "default",
    name: string = "webda"
  ): Promise<void> {
    const grants: RbacGrant[] = [];
    for (const service of Object.values(useCore().getServices())) {
      if (service instanceof KubernetesStore || service instanceof KubernetesOperator) {
        grants.push(...service.getRbacGrants());
      }
    }
    const manifests = buildRbac(grants, { name, serviceAccount, serviceAccountNamespace });
    writeFileSync(target, manifests.map(manifest => k8s.dumpYaml(manifest)).join("---\n"));
    this.log("INFO", `Exported ${manifests.length} RBAC objects to ${target}`);
  }
}

export { KubernetesCrdExporter };
