import * as k8s from "@kubernetes/client-node";
import { Command, Service, useCore } from "@webda/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KubernetesStore, toTypedCrd } from "../stores/kubernetesstore.service.js";

/**
 * Export the CustomResourceDefinitions of the Kubernetes stores
 *
 * Exposes the `webda kubernetes crd export` command
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
}

export { KubernetesCrdExporter };
