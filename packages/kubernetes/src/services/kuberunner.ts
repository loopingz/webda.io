import * as k8s from "@kubernetes/client-node";
import { AsyncAction, JobInfo, Runner, RunnerParameters } from "@webda/async";
import { FileUtils, ServiceParameters, YAMLUtils } from "@webda/core";
import { getKubernetesApiClient, K8sConfiguration, KubernetesParameters } from "../utils/client";

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
  config: string | K8sConfiguration;
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

  constructor(params: any) {
    super(params);
    if (this.jobImage === undefined && this.jobResources === undefined) {
      throw new Error("Either jobImage or jobResources need to be defined");
    }
    this.jobResources ??= YAMLUtils.parse(DEFAULT_JOB_DEFINITION);
    if (typeof this.jobResources === "string") {
      this.jobResources = FileUtils.load(this.jobResources);
    }
  }
}

/**
 * Type of action returned by LocalRunner
 */
export interface KubeJob extends k8s.V1Job {}

/**
 * Run a Job locally on the server by spawning a child process
 *
 * @WebdaModda
 */
export default class KubeRunner<T extends KubeRunnerParameters = KubeRunnerParameters> extends Runner<T> {
  client: k8s.KubernetesObjectApi;

  /**
   * @inheritdoc
   */
  loadParameters(params: any): ServiceParameters {
    return new KubeRunnerParameters(params);
  }

  /**
   * @inheritdoc
   */
  async launchAction(_action: AsyncAction, info: JobInfo): Promise<KubeJob> {
    const resources = this.getWebda()
      .getApplication()
      .replaceVariables(this.parameters.jobResources, {
        serviceName: this.getName(),
        image: this.parameters.jobImage,
        ...info,
        env: process.env
      });
    // Inject environment variable
    if (
      resources.spec &&
      resources.spec.template &&
      resources.spec.template.spec &&
      resources.spec.template.spec.containers
    ) {
      for (let cont of resources.spec.template.spec.containers) {
        cont.env ??= [];
        for (let envKey in info) {
          cont.env.push({
            name: envKey,
            value: info[envKey]
          });
        }
      }
    }
    // Launch the resource now
    return await this.client.create(resources);
  }

  /**
   * @inheritdoc
   */
  resolve(): this {
    super.resolve();
    this.client = <k8s.KubernetesObjectApi>getKubernetesApiClient(this.parameters);
    return this;
  }
}

export { KubeRunner };
