import { Command, CronDefinition, CronService, Service, templateVariables, useCore } from "@webda/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { CronReplace } from "../cron.js";

/**
 * Default CronJob template used when no template is provided
 */
export const K8S_DEFAULT_CRON_DEFINITION = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: \${cron.serviceName.toLowerCase()}-\${cron.method.toLowerCase()}-\${cron.cronId}
spec:
  concurrencyPolicy: Forbid
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - image: \${resources.tag}
              imagePullPolicy: Always
              name: scheduled-job
              resources: {}
              command: ["/webda/node_modules/.bin/webda"]
              args: [
                "--noCompile",
                "launch",
                "\${cron.serviceName}",
                "\${cron.method}",
                "\${...cron.args}",
              ]
          restartPolicy: Never
          securityContext: {}
          terminationGracePeriodSeconds: 30
  schedule: \${cron.cron}
  successfulJobsHistoryLimit: 3
`;

/**
 * Export the application crons as Kubernetes resources
 *
 * Exposes the `webda kubernetes cronExport` command
 *
 * @WebdaModda
 */
export default class KubernetesCronExporter extends Service {
  /**
   * Export all application Cron as Kubernetes resources
   *
   * @param template - Template file to use, default to a Kubernetes CronJob
   * @param target - Folder to write the resources to
   * @param filenameTemplate - Filename template to use
   * @param image - Image to use in the default template
   * @returns the number of exported crons
   */
  @Command("kubernetes cronExport", {
    description: "Export all application Cron as template",
    requires: ["kubernetes-cron-export"],
    phase: "resolved"
  })
  async cronExport(
    template?: string,
    target: string = "./crons",
    filenameTemplate: string = "${serviceName.toLowerCase()}.${method.toLowerCase()}-${cronId}.${ext}",
    image?: string
  ): Promise<number> {
    let ext: string;
    let content: string;
    if (template) {
      ext = extname(template).substring(1);
      content = readFileSync(template).toString();
    } else {
      content = K8S_DEFAULT_CRON_DEFINITION;
      ext = "yaml";
    }
    mkdirSync(target, { recursive: true });
    const crons = CronService.loadAnnotations(useCore().getServices());
    crons.forEach((cron: CronDefinition & { cronId?: string }) => {
      cron.cronId = CronService.getCronId(cron, "export");
      const filename = join(target, templateVariables(filenameTemplate, { ...cron, ext }));
      this.log("DEBUG", `Exporting ${filename} cron with ${cron.toString()}`);
      writeFileSync(filename, CronReplace(content, cron, { resources: { tag: image } }));
    });
    this.log("INFO", `Exported ${crons.length} crons`);
    return crons.length;
  }
}

export { KubernetesCronExporter };
