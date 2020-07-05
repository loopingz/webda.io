import { Docker, DockerResources } from "./docker";
import * as k8s from "@kubernetes/client-node";
import * as fs from "fs";
import * as yaml from "yaml";
import * as jsonpath from "jsonpath";
import { Deployer } from "./deployer";

export interface KubernetesObject {
  kind: string;
  apiVersion?: string;
  metadata: {
    name: string;
    namespace?: string;
  };
  [key: string]: any;
}

export function KubernetesObjectToURI({ apiVersion, metadata: { name, namespace }, kind }: KubernetesObject) {
  return `${apiVersion || "v1"}/${namespace || "default"}/${kind.toLowerCase()}s/${name}`;
}

export interface KubernetesResources extends DockerResources {
  context?: string;
  config?: string | Object;
  defaultNamespace?: string;
  resources?: any;
  patchResources?: any; //{ [key: string]: any };
  resourcesFile?: string;
  cronTemplate?: any;
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
      '$.metadata.annotations["webda.io/application"]',
      this.getApplication().getPackageDescription().name
    );
    jsonpath.value(
      spec,
      '$.metadata.annotations["webda.io/application/version"]',
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

  async deploy() {
    // Create the Docker image
    if (this.resources.tag && this.resources.push) {
      await this.manager.run("webdadeployer/docker", this.resources);
    }
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

    // Inline resource
    for (let i in this.resources.resources) {
      let resource: KubernetesObject = this.resources.patchResources[i];

      if (!resource.kind || !resource.metadata || !resource.metadata.name) {
        this.logger.log("ERROR", `Resource #${i} of resources is incorrect (kind,metadata.name) are required`);
        continue;
      }

      await this.upsertKubernetesObject(resource);
    }

    // File resource
    if (this.resources.resourcesFile) {
      if (this.resources.resourcesFile.match(/\.(ya?ml|json)$/i) && fs.existsSync(this.resources.resourcesFile)) {
        let resources = [];
        if (this.resources.resourcesFile.endsWith(".json")) {
          resources = JSON.parse(fs.readFileSync(this.resources.resourcesFile, "utf8"));
        } else {
          resources = yaml.parseAllDocuments(fs.readFileSync(this.resources.resourcesFile, "utf8"));
        }
        if (Array.isArray(resources)) {
          for (let i in resources) {
            let resource = resources[i];
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
      // we got the resource, so it exists, so patch it
      await this.client.patch(resource);
    } catch (e) {
      // we did not get the resource, so it does not exist, so create it
      await this.client.create(resource);
    }
  }
}
