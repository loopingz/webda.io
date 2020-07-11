import { Docker, DockerResources } from "./docker";
import * as k8s from "@kubernetes/client-node";
import * as fs from "fs";
import * as yaml from "yaml";
import * as jsonpath from "jsonpath";
import { Deployer } from "./deployer";
import { CronService, JSONUtils } from "@webda/core";
import * as crypto from "crypto";

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
          imagePullSecrets:
            - name: docker-registry-key
          restartPolicy: Never
          securityContext: {}
          terminationGracePeriodSeconds: 30
  schedule: \${cron.cron}
  successfulJobsHistoryLimit: 3
`;

export function KubernetesObjectToURI({ apiVersion, metadata: { name, namespace }, kind }: KubernetesObject) {
  return `${apiVersion || "v1"}/${namespace || "default"}/${kind.toLowerCase()}s/${name}`;
}

export interface KubernetesResources extends DockerResources {
  context?: string;
  config?: string | Object;
  defaultNamespace?: string;
  resources?: KubernetesObject[];
  patchResources?: any; //{ [key: string]: any };
  resourcesFile?: string;
  cronTemplate?: string | KubernetesObject;
}

const DEFAULT_API = {
  Deployment: "apps/v1"
};

export class Kubernetes extends Deployer<KubernetesResources> {
  client: any;
  async loadDefaults() {
    await super.loadDefaults();
    this.resources.defaultNamespace = this.resources.defaultNamespace || "default";
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
    resource.metadata.namespace = resource.metadata.namespace || this.resources.defaultNamespace;
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

  getCronId(cron) {
    let hash = crypto.createHash("md5");
    return hash
      .update(JSON.stringify(cron) + this.name + this.manager.getDeploymentName())
      .digest("hex")
      .substr(0, 8);
  }

  async deploy() {
    // Create the Docker image
    if (this.resources.tag && this.resources.push) {
      this.logger.log("INFO", "Launching subdeployer Docker");
      await this.manager.run("webdadeployer/docker", this.resources);
    }

    this.logger.log("INFO", "Initializing Kubernetes Client");
    // Initiate Kubernetes
    const kc = new k8s.KubeConfig();
    // Load all type of configuration
    if (this.resources.config) {
      if (typeof this.resources.config === "string") {
        if (!this.resources.resourcesFile.match(/\.(ya?ml|json)$/i) || !fs.existsSync(this.resources.config)) {
          throw new Error("Configuration file does not exist");
        }
        if (this.resources.config.endsWith("json")) {
          kc.loadFromOptions(JSON.parse(fs.readFileSync(this.resources.config, "utf8")));
        } else {
          kc.loadFromOptions(yaml.parse(fs.readFileSync(this.resources.config, "utf8")));
        }
      } else {
        kc.loadFromOptions(this.resources.config);
      }
    } else {
      kc.loadFromDefault();
    }
    if (this.resources.context) {
      kc.setCurrentContext(this.resources.context);
    }
    this.client = k8s.KubernetesObjectApi.makeApiClient(kc);

    // Manage CronJob - add resource if required
    if (this.resources.cronTemplate) {
      this.logger.log("INFO", "Adding CronJob resources");
      let crons = CronService.loadAnnotations(this.manager.getWebda().getServices());
      let resource;
      if (typeof this.resources.cronTemplate === "boolean") {
        resource = yaml.parse(DEFAULT_CRON_DEFINITION);
      } else if (typeof this.resources.cronTemplate === "string") {
        resource = JSONUtils.loadFile(this.resources.cronTemplate);
      } else {
        resource = this.resources.cronTemplate;
      }
      this.completeResource(resource);
      let cronDeployerId = crypto
        .createHash("md5")
        .update(this.name + this.manager.getDeploymentName())
        .digest("hex");
      jsonpath.value(resource, '$.metadata.annotations["webda.io/crondeployer"]', cronDeployerId);

      this.resources.resources = this.resources.resources || [];
      let ids = [];
      crons.forEach(cron => {
        this.parameters.cron = { ...cron, cronId: this.getCronId(cron) };
        jsonpath.value(resource, '$.metadata.annotations["webda.io/cronid"]', this.parameters.cron.cronId);
        ids.push(this.parameters.cron.cronId);
        this.resources.resources.push(this.objectParameter(resource));
      });
      this.parameters.cron = undefined;
      //await this.client.
      // Search for any cron that was deployed by us
      this.logger.log("INFO", JSON.stringify(this.resources.resources, undefined, 2));
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
        for (let i in resource.patch) {
          let path = i;
          if (!i.startsWith("$.")) {
            path = "$." + path;
          }
          jsonpath.value(spec, path, resource.patch[i]);
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
    if (this.resources.resourcesFile) {
      if (this.resources.resourcesFile.match(/\.(ya?ml|json)$/i) && fs.existsSync(this.resources.resourcesFile)) {
        let resources = JSONUtils.loadFile(this.resources.resourcesFile);
        if (Array.isArray(resources)) {
          for (let i in resources) {
            let resource = this.objectParameter(resources[i]);
            if (!this.completeResource(resource)) {
              this.logger.log("ERROR", `Resource invalid #${i} of resourcesFile`);
              continue;
            }
            await this.upsertKubernetesObject(resource);
          }
        } else {
          this.logger.log("ERROR", `Resource file #${this.resources.resourcesFile} should contain an array`);
        }
      } else {
        this.logger.log("ERROR", `Resource file #${this.resources.resourcesFile} does not exist or invalid format`);
      }
    }
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
        this.logger.log("ERROR", "Cannot patch", resource.metadata, e);
      }
    } catch (e) {
      // we did not get the resource, so it does not exist, so create it
      await this.client.create(resource);
    }
  }
}