import { Command, CronService, Deployer, getDeploymentVariables, SecretString, WebdaError } from "@webda/core";
import { formatImageReference, parseImageReference } from "@webda/oci";
import { AzureAuth } from "../auth.js";
import {
  armValue,
  AzureTemplate,
  containerAppsSchedule,
  resourceId,
  roleAssignmentId,
  createAzureTemplate
} from "../template.js";
import { createHash } from "node:crypto";
import { AzureArmDeployer, AzureArmDeployerParameters, AzureDeployResult } from "./arm.service.js";

export const AZURE_SECTIONS = ["LogAnalytics", "ManagedEnvironment", "ContainerApp", "Jobs", "Resources"] as const;

/** Azure Container Apps unit parameters. Image tags and Azure resource tags are separate. */
export class AzureContainerAppsDeployerParameters extends AzureArmDeployerParameters {
  registry?: string;
  registryAuth: "aad" | "identity" | "none" = "aad";
  containerApp: {
    name?: string;
    cpu?: number;
    memory?: string;
    minReplicas?: number;
    maxReplicas?: number;
    ingress?: false | { external?: boolean; targetPort?: number; transport?: string };
    env?: Record<string, string | { secretRef: string }>;
    probes?: Record<string, any>[];
    scaleRules?: Record<string, any>[];
  } = {};
  environment: { name?: string; id?: string } = {};
  logAnalytics: false | { name?: string; retentionInDays?: number } = {};
  secrets: Record<string, string | SecretString | { keyVaultUrl: string; identity: string }> = {};
  customDomains: { name: string; certificateId?: string; bindingType?: string; validationMethod?: "CNAME" | "HTTP" }[] =
    [];
  crons = true;
}

/** Build an OCI image and deploy its immutable digest to Azure Container Apps.
 * @WebdaModda
 */
export class AzureContainerAppsDeployer
  extends AzureArmDeployer<AzureContainerAppsDeployerParameters>
  implements Deployer
{
  static Parameters = AzureContainerAppsDeployerParameters;
  protected image = "";

  /**
   * Write the generated ARM template for review.
   * @param output - Optional template output path
   * @returns Generated ARM template
   */
  @Command("azure template", { description: "Generate the Container Apps ARM template" })
  async generate(output?: string): Promise<AzureTemplate> {
    return super.generate(output);
  }

  /**
   * Perform get resolved parameters.
   * @override
   */
  getResolvedParameters(): AzureContainerAppsDeployerParameters {
    const p = super.getResolvedParameters();
    const name = this.getName()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    p.containerApp.name ??= name;
    p.environment.name ??=
      p.environment.id && !p.environment.id.startsWith("[")
        ? p.environment.id.split("/").slice(-1)[0]
        : `${p.resourceGroup}-env`;
    if (!p.image && p.registry) {
      const packageName = getDeploymentVariables(this).package.name?.replace(/^@[^/]+\//, "") ?? name;
      p.image = `${p.registry}.azurecr.io/${packageName.toLowerCase()}`;
    }
    if (!p.image) throw new WebdaError.BadRequest("Container Apps requires image or registry");
    if (!/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(p.containerApp.name))
      throw new WebdaError.BadRequest("Invalid Container App name (2-32 lowercase letters, numbers and hyphens)");
    return p;
  }

  /**
   * Return the application resource identifier.
   * @returns The app resource id result
   */
  getAppResourceId(): string {
    return resourceId("Microsoft.App/containerApps", this.resources.containerApp.name!);
  }
  /**
   * Return the managed identity resource identifier.
   * @returns The identity resource id result
   */
  protected getIdentityResourceId(): string {
    return resourceId(
      "Microsoft.ManagedIdentity/userAssignedIdentities",
      `${this.resources.containerApp.name}-identity`
    );
  }
  /**
   * Return the ARM expression for the application principal.
   * @returns The app principal id result
   */
  getAppPrincipalId(): string {
    return `[reference(${armValue(this.getIdentityResourceId())}, '2023-01-31').principalId]`;
  }
  /**
   * Return the managed environment resource identifier.
   * @returns The environment id result
   */
  protected environmentId(): string {
    return (
      this.resources.environment.id ?? resourceId("Microsoft.App/managedEnvironments", this.resources.environment.name!)
    );
  }
  /**
   * Describe the application managed identity.
   * @returns The identity result
   */
  protected identity() {
    return { type: "SystemAssigned, UserAssigned", userAssignedIdentities: { [this.getIdentityResourceId()]: {} } };
  }
  /**
   * Build the runtime environment from contributors and explicit overrides.
   * @returns The env result
   */
  protected env() {
    return Object.entries({
      ...this.contributedEnv,
      AZURE_CLIENT_ID: `[reference(${armValue(this.getIdentityResourceId())}, '2023-01-31').clientId]`,
      ...this.resources.containerApp.env
    }).map(([name, value]) => ({ name, ...(typeof value === "string" ? { value } : value) }));
  }
  /**
   * Convert configured secrets to secure parameters or Key Vault references.
   * @returns The secrets result
   */
  protected secrets() {
    return Object.entries(this.resources.secrets).map(([name, value]) => ({
      name,
      ...(typeof value === "object" && !(value instanceof SecretString)
        ? value
        : { value: this.secureParameter(value) })
    }));
  }
  /**
   * Configure managed identity image pulls.
   * @returns The registries result
   */
  protected registries() {
    if (this.resources.registryAuth === "none") return [];
    const target = parseImageReference(this.resources.image!);
    return [{ server: target.registry, identity: this.getIdentityResourceId() }];
  }

  /**
   * Generate the deployment template without contacting Azure.
   * @param image - Immutable container image reference
   * @returns ARM template without secret values
   */
  generateTemplate(image?: string): AzureTemplate {
    this.prepare();
    const target = parseImageReference(this.resources.image!);
    this.image = image ?? formatImageReference({ ...target, tag: target.digest ? undefined : target.tag });
    this.addResource({
      type: "Microsoft.ManagedIdentity/userAssignedIdentities",
      apiVersion: "2023-01-31",
      name: `${this.resources.containerApp.name}-identity`,
      location: this.resources.location,
      tags: this.getDefaultTags()
    });
    this.Resources();
    if (!this.resources.environment.id) {
      if (this.resources.logAnalytics !== false) this.LogAnalytics();
      this.ManagedEnvironment();
    }
    if (this.resources.registryAuth !== "none") {
      const registry = this.resources.registry ?? target.registry.split(".")[0];
      this.roles.push({
        scope: resourceId("Microsoft.ContainerRegistry/registries", registry),
        roleDefinitionId: `/subscriptions/${this.resources.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/7f951dda-4ed3-4680-a7ca-43fe172d538d`
      });
    }
    this.grantRoles();
    this.ContainerApp();
    this.ManagedCertificates();
    if (this.resources.crons) this.Jobs();
    this.template.outputs.fqdn = {
      type: "string",
      value: `[reference(${armValue(this.getAppResourceId())}, '2024-03-01').configuration.ingress.fqdn]`
    };
    this.template.outputs.latestRevisionName = {
      type: "string",
      value: `[reference(${armValue(this.getAppResourceId())}, '2024-03-01').latestRevisionName]`
    };
    return this.template;
  }

  /**
   * Add the optional Log Analytics workspace.
   */
  LogAnalytics(): void {
    const p = this.resources,
      log = p.logAnalytics;
    if (log === false) return;
    this.addResource({
      type: "Microsoft.OperationalInsights/workspaces",
      apiVersion: "2023-09-01",
      name: log.name ?? `${p.environment.name}-logs`,
      location: p.location,
      tags: this.getDefaultTags(),
      properties: { sku: { name: "PerGB2018" }, retentionInDays: log.retentionInDays ?? 30 }
    });
  }
  /**
   * Add the Container Apps managed environment.
   */
  ManagedEnvironment(): void {
    const p = this.resources,
      log = p.logAnalytics;
    const workspace =
      log === false
        ? undefined
        : resourceId("Microsoft.OperationalInsights/workspaces", log.name ?? `${p.environment.name}-logs`);
    this.addResource({
      type: "Microsoft.App/managedEnvironments",
      apiVersion: "2024-03-01",
      name: p.environment.name,
      location: p.location,
      tags: this.getDefaultTags(),
      dependsOn: workspace ? [workspace] : [],
      properties: workspace
        ? {
            appLogsConfiguration: {
              destination: "log-analytics",
              logAnalyticsConfiguration: {
                customerId: `[reference(${armValue(workspace)}, '2023-09-01').customerId]`,
                sharedKey: `[listKeys(${armValue(workspace)}, '2023-09-01').primarySharedKey]`
              }
            }
          }
        : {}
    });
  }
  /**
   * Add the application and its scaling and ingress settings.
   */
  ContainerApp(): void {
    const p = this.resources,
      app = p.containerApp;
    const roleIds = this.template.resources
      .filter(resource => resource.type === "Microsoft.Authorization/roleAssignments")
      .map(roleAssignmentId);
    this.addResource({
      type: "Microsoft.App/containerApps",
      apiVersion: "2024-03-01",
      name: app.name,
      location: p.location,
      tags: this.getDefaultTags(),
      identity: this.identity(),
      dependsOn: [this.getIdentityResourceId(), ...(!p.environment.id ? [this.environmentId()] : []), ...roleIds],
      properties: {
        managedEnvironmentId: this.environmentId(),
        configuration: {
          activeRevisionsMode: "Single",
          ingress:
            app.ingress === false
              ? undefined
              : {
                  external: true,
                  targetPort: 18080,
                  transport: "auto",
                  ...app.ingress,
                  customDomains: p.customDomains.map(domain => ({
                    name: domain.name,
                    certificateId: domain.certificateId,
                    bindingType: domain.certificateId ? (domain.bindingType ?? "SniEnabled") : "Disabled"
                  }))
                },
          secrets: this.secrets(),
          registries: this.registries()
        },
        template: {
          containers: [
            {
              name: "webda",
              image: this.image,
              resources: { cpu: app.cpu ?? 0.5, memory: app.memory ?? "1Gi" },
              env: this.env(),
              probes: app.probes
            }
          ],
          scale: {
            minReplicas: p.customDomains.some(domain => !domain.certificateId)
              ? Math.max(1, app.minReplicas ?? 0)
              : (app.minReplicas ?? 0),
            maxReplicas: app.maxReplicas ?? 10,
            rules: app.scaleRules
          }
        }
      }
    });
  }

  /** Issue managed certificates after hostname registration, then bind them in a nested deployment. */
  ManagedCertificates(): void {
    const managed = this.resources.customDomains.filter(domain => !domain.certificateId);
    if (!managed.length) return;
    if (this.resources.containerApp.ingress === false || this.resources.containerApp.ingress?.external === false)
      throw new WebdaError.BadRequest("Managed certificates require public HTTP ingress");
    const app = this.template.resources.find(resource => resource.type === "Microsoft.App/containerApps")!;
    const certificates = new Map<string, string>();
    for (const domain of managed) {
      if (!/^[a-zA-Z0-9.-]+$/.test(domain.name)) throw new WebdaError.BadRequest("Invalid custom domain name");
      const name = `${this.resources.containerApp.name}-${createHash("sha256").update(domain.name).digest("hex").slice(0, 8)}`;
      const id = resourceId(
        "Microsoft.App/managedEnvironments/managedCertificates",
        this.resources.environment.name!,
        name
      );
      certificates.set(domain.name, id);
      this.addResource({
        type: "Microsoft.App/managedEnvironments/managedCertificates",
        apiVersion: "2024-03-01",
        name: `${this.resources.environment.name}/${name}`,
        location: this.resources.location,
        dependsOn: [this.getAppResourceId()],
        properties: { subjectName: domain.name, domainControlValidation: domain.validationMethod ?? "CNAME" }
      });
    }
    const boundApp = structuredClone(app);
    delete boundApp.dependsOn;
    boundApp.properties.configuration.ingress.customDomains = this.resources.customDomains.map(domain => ({
      name: domain.name,
      certificateId: domain.certificateId ?? certificates.get(domain.name),
      bindingType: domain.bindingType ?? "SniEnabled"
    }));
    const nested = createAzureTemplate();
    nested.parameters = structuredClone(this.template.parameters);
    nested.resources = [boundApp];
    this.addResource({
      type: "Microsoft.Resources/deployments",
      apiVersion: "2022-09-01",
      name: `${this.resources.containerApp.name}-domains`,
      dependsOn: [...certificates.values()],
      properties: {
        mode: "Incremental",
        expressionEvaluationOptions: { scope: "inner" },
        template: nested,
        parameters: Object.fromEntries(
          Object.keys(nested.parameters).map(name => [name, { value: `[parameters('${name}')]` }])
        )
      }
    });
  }
  /**
   * Export declared crons as scheduled jobs, each running `cron run --id` on its operation.
   */
  Jobs(): void {
    for (const cron of CronService.resolveCrons()) {
      const id = CronService.getExportId(cron),
        p = this.resources,
        app = p.containerApp;
      const name = `${app.name!.slice(0, 15)}-${id.slice(0, 16)}`.toLowerCase();
      this.addResource({
        type: "Microsoft.App/jobs",
        apiVersion: "2024-03-01",
        name,
        location: p.location,
        tags: this.getDefaultTags(),
        identity: this.identity(),
        dependsOn: [this.getAppResourceId()],
        properties: {
          environmentId: this.environmentId(),
          configuration: {
            triggerType: "Schedule",
            replicaTimeout: 1800,
            replicaRetryLimit: 3,
            scheduleTriggerConfig: {
              cronExpression: containerAppsSchedule(cron.cron),
              parallelism: 1,
              replicaCompletionCount: 1
            },
            secrets: this.secrets(),
            registries: this.registries()
          },
          template: {
            containers: [
              {
                name: "webda",
                image: this.image,
                args: ["cron", "run", "--id", id],
                env: this.env(),
                resources: { cpu: app.cpu ?? 0.5, memory: app.memory ?? "1Gi" }
              }
            ]
          }
        }
      });
    }
  }

  /**
   * Publish the OCI image using the selected registry authentication.
   * @returns The push result
   */
  @Command("container push", { description: "Build and push the image using Azure registry authentication" })
  async push(): Promise<string> {
    const p = this.getResolvedParameters();
    if (p.registryAuth === "aad") {
      const server = parseImageReference(p.image!).registry;
      const token = await new AzureAuth(p).getAcrRefreshToken(server);
      this.parameters.credentials[server] = { identityToken: new SecretString(token, "azure") };
    }
    return super.push();
  }

  /**
   * Publish and deploy the application, returning its endpoints.
   * @returns The deploy result
   */
  @Command("deploy", { description: "Build, publish and deploy the application to Azure Container Apps" })
  async deploy(): Promise<AzureDeployResult> {
    const digest = await this.push();
    const p = this.getResolvedParameters(),
      target = parseImageReference(p.image!);
    const image = formatImageReference({ ...target, tag: undefined, digest });
    this.generateTemplate(image);
    this.writeTemplate();
    const outputs = await this.sendTemplate();
    return (this.result = {
      image,
      digest,
      fqdn: outputs.fqdn?.value,
      revision: outputs.latestRevisionName?.value,
      outputs
    });
  }
}
