import * as k8s from "@kubernetes/client-node";
import { AsyncAction, JobInfo, Runner, RunnerParameters } from "@webda/async";
import { templateVariables } from "@webda/core";
import { FileUtils, YAMLUtils } from "@webda/utils";
import { getKubernetesApiClient, K8sConfiguration, KubernetesParameters } from "../utils/client.js";

const DEFAULT_JOB_DEFINITION = `apiVersion: batch/v1
kind: Job
metadata:
  name: \${serviceName}-\${JOB_ID}
spec:
  template:
    spec:
      containers:
        - image: \${image}
          name: \${serviceName}
          resources: {}
      restartPolicy: Never
`;

/**
 * Parameters for the KubeRunner
 */
export class KubeRunnerParameters extends RunnerParameters implements KubernetesParameters {
  /**
   * Kubernetes configuration
   */
  config?: string | K8sConfiguration;
  /**
   * Default context to use
   */
  context?: string;
  /**
   * Kubernetes resources to use
   */
  jobResources?: any;
  /**
   * If default template, use this image
   */
  jobImage?: string;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    if (this.jobImage === undefined && this.jobResources === undefined) {
      throw new Error("Either jobImage or jobResources need to be defined");
    }
    this.jobResources ??= YAMLUtils.parse(DEFAULT_JOB_DEFINITION);
    if (typeof this.jobResources === "string") {
      // Convert to a plain object (yaml files are loaded as comment-preserving documents)
      this.jobResources = JSON.parse(JSON.stringify(FileUtils.load(this.jobResources)));
    }
    return this;
  }
}

/**
 * Kubernetes object reference returned by the KubeRunner
 */
export interface KubeJobReference {
  metadata: k8s.V1ObjectMeta;
  apiVersion: string;
  kind: string;
}

/**
 * Run a Job on a Kubernetes cluster
 *
 * @WebdaModda
 */
export default class KubeRunner<T extends KubeRunnerParameters = KubeRunnerParameters> extends Runner<T> {
  client: k8s.KubernetesObjectApi;

  /**
   * @inheritdoc
   * @param _action - the action to launch
   * @param info - the job information
   * @returns the created job reference
   */
  async launchAction(_action: AsyncAction, info: JobInfo): Promise<KubeJobReference> {
    const resources = templateVariables(this.parameters.jobResources, {
      serviceName: this.getName(),
      image: this.parameters.jobImage,
      ...info,
      env: process.env
    });
    // Inject environment variable
    if (resources.spec?.template?.spec?.containers) {
      for (const cont of resources.spec.template.spec.containers) {
        cont.env ??= [];
        for (const envKey in info) {
          cont.env.push({
            name: envKey,
            value: info[envKey]
          });
        }
      }
    }
    // Launch the resource now
    const result = await this.client.create(resources);
    return { metadata: result.metadata, apiVersion: result.apiVersion, kind: result.kind };
  }

  /**
   * @inheritdoc
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this.client = <k8s.KubernetesObjectApi>getKubernetesApiClient(this.parameters);
    return this;
  }
}

export { KubeRunner };
