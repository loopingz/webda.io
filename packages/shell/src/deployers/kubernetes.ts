import { ContainerResources } from "./container";
import * as k8s from "@kubernetes/client-node";
import * as fs from "fs";
import * as yaml from "yaml";
import * as jsonpath from "jsonpath";
import { Deployer } from "./deployer";
import { CronService, JSONUtils, CronDefinition } from "@webda/core";
import * as crypto from "crypto";
import { getKubernetesApiClient, KubernetesParameters } from "@webda/kubernetes";

export interface KubernetesObject {
  kind: string;
  apiVersion?: string;
  metadata: {
    name: string;
    namespace?: string;
  };
  [key: string]: any;
}

const DEFAULT_CRON_DEFINITION = `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: \${cron.serviceName}-\${cron.method.toLowerCase()}-\${cron.cronId}
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
          restartPolicy: Never
          securityContext: {}
          terminationGracePeriodSeconds: 30
  schedule: \${cron.cron}
  successfulJobsHistoryLimit: 3
`;

export function KubernetesObjectToURI({ apiVersion, metadata: { name, namespace }, kind }: KubernetesObject) {
  return `${apiVersion || "v1"}/${namespace || "default"}/${kind.toLowerCase()}s/${name}`;
}

export interface KubernetesResources extends ContainerResources, KubernetesParameters {
  defaultNamespace?: string;
  resources?: KubernetesObject[];
  patchResources?: any; //{ [key: string]: any };
  resourcesFile?: string;
  resourcesFiles?: string[];
  cronTemplate?: string | boolean | KubernetesObject;
}

const DEFAULT_API = {
  Deployment: "apps/v1"
};

/**
 * @WebdaDeployer
 */
export class Kubernetes extends Deployer<KubernetesResources> {
  client: k8s.KubernetesObjectApi;
  async loadDefaults() {
    await super.loadDefaults();
    this.resources.defaultNamespace ??= "default";
    // Ensure resourcesFile is always an array
    this.resources.resourcesFiles ??= [];
    // Push resourcesFile to resourcesFiles array
    if (this.resources.resourcesFile && !this.resources.resourcesFiles.includes(this.resources.resourcesFile)) {
      this.resources.resourcesFiles.push(this.resources.resourcesFile);
    }
  }

  addAnnotation(spec) {
    jsonpath.value(spec, '$.metadata.annotations["webda.io/deployer"]', this.name);
    jsonpath.value(spec, '$.metadata.annotations["webda.io/deployment"]', this.manager.getDeploymentName());
    jsonpath.value(spec, '$.metadata.annotations["webda.io/version"]', this.getApplication().getWebdaVersion());
    jsonpath.value(
      spec,
      '$.metadata.annotations["webda.io/application.name"]',
      this.getApplication().getPackageDescription().name
    );
    jsonpath.value(
      spec,
      '$.metadata.annotations["webda.io/application.version"]',
      this.getApplication().getPackageDescription().version
    );
  }

  completeResource(resource: KubernetesObject): boolean {
    if (!resource.kind || !resource.metadata || !resource.metadata.name) {
      return false;
    }
    resource.metadata.namespace ??= this.resources.defaultNamespace;
    if (!resource.apiVersion) {
      // Try to guess
      if (DEFAULT_API[resource.kind]) {
        resource.apiVersion = DEFAULT_API[resource.kind];
      } else {
        resource.apiVersion = "v1";
      }
    }
    return true;
  }

  getCronId(cron: CronDefinition) {
    let hash = crypto.createHash("sha256");
    return hash
      .update(JSON.stringify(cron) + this.name + this.manager.getDeploymentName())
      .digest("hex")
      .substring(0, 8);
  }

  async deploy() {
    // Create the Docker image
    if (this.resources.tag && this.resources.push) {
      this.logger.log("INFO", "Launching subdeployer Docker");
      await this.manager.run("webdadeployer/docker", this.resources);
    }

    this.logger.log("INFO", "Initializing Kubernetes Client");
    // Check all resource
    this.resources.resourcesFiles.forEach(resourcesFile => {
      if (!resourcesFile.match(/\.(ya?ml|json)$/i) || !fs.existsSync(resourcesFile)) {
        throw new Error(`Resource file #${resourcesFile} does not exist or invalid format`);
      }
    });
    // Load all type of configuration
    this.client = <k8s.KubernetesObjectApi>this.getClient();

    // Manage CronJob - add resource if required
    if (this.resources.cronTemplate) {
      this.logger.log("INFO", "Adding CronJob resources");
      // Load all existing Cron annotations
      let crons = CronService.loadAnnotations(this.manager.getWebda().getServices());
      // Load CronJob resource template
      let resource;
      if (typeof this.resources.cronTemplate === "boolean") {
        resource = yaml.parse(DEFAULT_CRON_DEFINITION);
      } else if (typeof this.resources.cronTemplate === "string") {
        resource = JSONUtils.loadFile(this.resources.cronTemplate);
      } else {
        resource = this.resources.cronTemplate;
      }
      // Namespace where cronjob resource are created
      let cronNamespace = resource.metadata.namespace || "default";
      // Add annotations to the CronJob template
      this.completeResource(resource);
      let cronDeployerId = crypto
        .createHash("sha256")
        .update(this.name + this.manager.getDeploymentName() + this.getApplication().getPackageDescription().name)
        .digest("hex");
      jsonpath.value(resource, '$.metadata.annotations["webda.io/crondeployer"]', cronDeployerId);

      const k8sApi = <k8s.BatchV1beta1Api>this.getClient(k8s.BatchV1beta1Api);
      let currentJobs = (
        await k8sApi.listNamespacedCronJob(resource.metadata.namespace || "default")
      ).body.items.filter(i => i.metadata.annotations["webda.io/crondeployer"] === cronDeployerId);
      let currentJobsNamesMap = {};
      currentJobs.forEach(
        i =>
          (currentJobsNamesMap[
            i.metadata.name
          ] = `${i.spec.schedule} ${i.metadata.annotations["webda.io/crondescription"]}`)
      );
      this.resources.resources = this.resources.resources || [];
      crons.forEach(cron => {
        this.parameters.cron = { ...cron, cronId: this.getCronId(cron) };
        jsonpath.value(resource, '$.metadata.annotations["webda.io/cronid"]', this.parameters.cron.cronId);
        jsonpath.value(resource, '$.metadata.annotations["webda.io/crondescription"]', cron.toString());
        let cronResource = this.replaceVariables(resource);
        this.resources.resources.push(cronResource);
        if (currentJobsNamesMap[cronResource.metadata.name] !== undefined) {
          delete currentJobsNamesMap[cronResource.metadata.name];
          this.logger.log("INFO", `Updating CronJob ${cronResource.metadata.name}: ${cron.toString()}`);
        } else {
          this.logger.log("INFO", `Adding CronJob ${cronResource.metadata.name}: ${cron.toString()}`);
        }
      });
      this.parameters.cron = undefined;
      // Remove any cronjob created by this deployer that is not required anymore
      for (let i in currentJobsNamesMap) {
        this.logger.log("INFO", `Deleting CronJob ${i}: ${currentJobsNamesMap[i]}`);
        // Delete resource
        await k8sApi.deleteNamespacedCronJob(i, cronNamespace);
      }
    }

    this.logger.log("INFO", "Manage patch resources");
    // Patch resource
    for (let i in this.resources.patchResources) {
      let resource: KubernetesObject = this.resources.patchResources[i];

      if (!this.completeResource(resource)) {
        this.logger.log("ERROR", `Resource #${i} of patchResources is incorrect (kind,metadata.name) are required`);
        continue;
      }

      try {
        let spec = (await this.client.read(resource)).body;
        for (let prop in resource.patch) {
          let path = prop;
          if (!prop.startsWith("$.")) {
            path = "$." + path;
          }
          jsonpath.value(spec, path, resource.patch[prop]);
        }
        this.addAnnotation(spec);
        await this.client.patch(spec);
      } catch (err) {
        this.logger.log("ERROR", "Could not patch Kubernetes resource", KubernetesObjectToURI(resource));
      }
    }

    this.logger.log("INFO", "Manage inline resources");
    // Inline resource
    for (let i in this.resources.resources) {
      let resource: KubernetesObject = this.resources.resources[i];

      if (!this.completeResource(resource)) {
        this.logger.log("ERROR", `Resource #${i} of resources is incorrect (kind,metadata.name) are required`);
        continue;
      }
      this.addAnnotation(resource);
      await this.upsertKubernetesObject(resource);
    }

    this.logger.log("INFO", "Manage file resources");
    // File resource

    for (let i in this.resources.resourcesFiles) {
      let resourcesFile = this.resources.resourcesFiles[i];
      let resources = JSONUtils.loadFile(resourcesFile);
      if (!Array.isArray(resources)) {
        resources = [resources];
      }
      for (let j in resources) {
        let resource = this.replaceVariables(resources[j]);
        if (!this.completeResource(resource)) {
          this.logger.log("ERROR", `Resource invalid #${j} of resourcesFile`);
          continue;
        }
        await this.upsertKubernetesObject(resource);
      }
    }
  }

  getClient(api?: any): k8s.ApiType | k8s.KubernetesObjectApi {
    return getKubernetesApiClient(this.resources, api);
  }

  async upsertKubernetesObject(resource: KubernetesObject) {
    try {
      // try to get the resource, if it does not exist an error will be thrown and we will end up in the catch
      // block.
      await this.client.read(resource);
      this.logger.log("INFO", "Updating", resource.metadata);
      try {
        if (resource.kind === "Certificate" && resource.apiVersion === "certmanager.k8s.io/v1alpha1") {
          // Certificate are not patchable
          return;
        }
        // we got the resource, so it exists, so patch it
        await this.client.patch(resource);
      } catch (e) {
        if (e.body && e.body.kind === "Status") {
          this.logger.log("ERROR", "Cannot patch", resource.metadata, e.body.message);
        } else {
          this.logger.log("ERROR", "Cannot patch", resource.metadata, e);
        }
      }
    } catch (e) {
      // we did not get the resource, so it does not exist, so create it
      await this.client.create(resource);
    }
  }
}
