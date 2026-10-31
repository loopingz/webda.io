import { ResourceManagementClient } from "@azure/arm-resources";
import { DeploymentsClient } from "@azure/arm-resourcesdeployments";
import { Command, SecretString, useApplication, useCore, WebdaError } from "@webda/core";
import { ContainerDeployer, ContainerDeployerParameters } from "@webda/oci";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AzureAuth } from "../auth.js";
import { AzureServiceParameters, loadAzureParameters } from "../services/azure-parameters.js";
import { AzureContributor, AzureDeployerInfo, AzureRoleAssignment } from "../services/contributors.js";
import { armValue, AzureTemplate, createAzureTemplate, resourceId } from "../template.js";

/** Shared ARM and OCI parameters used by Azure deployment units. */
export class AzureArmDeployerParameters extends ContainerDeployerParameters implements AzureServiceParameters {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string | SecretString;
  subscriptionId!: string;
  endpoint?: string;
  resourceGroup!: string;
  location = "westeurope";
  createResourceGroup = false;
  deploymentName?: string;
  resourceTags: Record<string, string> = { "webda-deployment": "${deployment}", "webda-version": "${git.version}" };
  customResources: Record<string, any>[] | Record<string, Record<string, any>> = [];
  templateOutput?: string;

  /**
   * Perform load.
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    return loadAzureParameters(this);
  }
}

/** Deployment results contain resource endpoints, never tokens or secret parameter values. */
export interface AzureDeployResult {
  image?: string;
  digest?: string;
  fqdn?: string;
  revision?: string;
  outputs: Record<string, any>;
}

/**
 * Restore secret wrappers after deployment variable expansion serializes their masked values.
 * @param original - Original parameters retaining secret wrappers
 * @param resolved - Parameters after deployment variable expansion
 * @returns The restore secrets result
 */
function restoreSecrets(original: any, resolved: any): any {
  if (original instanceof SecretString) return original;
  if (original && typeof original === "object" && resolved && typeof resolved === "object") {
    for (const key of Object.keys(original))
      if (Object.prototype.hasOwnProperty.call(resolved, key))
        resolved[key] = restoreSecrets(original[key], resolved[key]);
  }
  return resolved;
}

/** Shared template collection and ARM deployment. SDK clients are created only when deploying. */
export abstract class AzureArmDeployer<T extends AzureArmDeployerParameters = AzureArmDeployerParameters>
  extends ContainerDeployer<T, AzureDeployResult>
  implements AzureDeployerInfo
{
  resources!: T;
  template: AzureTemplate = createAzureTemplate();
  result?: AzureDeployResult;
  protected secretValues = new Map<string, string | SecretString>();
  protected contributedEnv: Record<string, string | { secretRef: string }> = {};
  protected roles: AzureRoleAssignment[] = [];

  /**
   * Perform get resolved parameters.
   * @override
   */
  getResolvedParameters(): T {
    return restoreSecrets(this.parameters, super.getResolvedParameters());
  }

  /**
   * Resolve the deployment scope and reset template state.
   */
  protected prepare(): void {
    this.resources = this.getResolvedParameters();
    if (!this.resources.resourceGroup || !this.resources.subscriptionId)
      throw new WebdaError.BadRequest(
        "Azure deployment requires resourceGroup and subscriptionId (or AZURE_SUBSCRIPTION_ID)"
      );
    this.template = createAzureTemplate();
    this.secretValues.clear();
    this.contributedEnv = {};
    this.roles = [];
  }

  /**
   * Merge deployment tags with resource tags.
   * @param tags - Resource-specific tags
   * @returns The default tags result
   */
  getDefaultTags(tags: Record<string, string> = {}): Record<string, string> {
    return { ...this.resources.resourceTags, ...tags };
  }
  abstract getAppResourceId(): string;
  /**
   * Return the managed identity resource identifier.
   * @returns The identity resource id result
   */
  protected getIdentityResourceId(): string {
    return this.getAppResourceId();
  }
  /**
   * Return the ARM expression for the application principal.
   * @returns The app principal id result
   */
  abstract getAppPrincipalId(): string;
  abstract generateTemplate(image?: string): AzureTemplate;

  /**
   * Add a secret without placing its value in the serializable template.
   * @param value - Value to convert or protect
   * @returns The secure parameter result
   */
  protected secureParameter(value: string | SecretString): string {
    const name = `secret${this.secretValues.size}`;
    this.template.parameters[name] = { type: "secureString" };
    this.secretValues.set(name, value);
    return `[parameters('${name}')]`;
  }

  /**
   * Merge service resources, environment and roles. Conflicting contributions are rejected.
   */
  Resources(): void {
    for (const service of Object.values(useCore().getServices())) {
      if (service === this || typeof (service as unknown as AzureContributor)?.getAzureResources !== "function")
        continue;
      const contribution = (service as unknown as AzureContributor).getAzureResources(this);
      for (const resource of contribution.resources ?? []) this.addResource(resource);
      for (const [name, value] of Object.entries(contribution.env ?? {})) {
        if (name in this.contributedEnv && JSON.stringify(this.contributedEnv[name]) !== JSON.stringify(value))
          throw new WebdaError.BadRequest(`Conflicting Azure environment contribution: ${name}`);
        this.contributedEnv[name] = value;
      }
      for (const [name, value] of Object.entries(contribution.outputs ?? {})) {
        if (name in this.template.outputs) throw new WebdaError.BadRequest(`Conflicting Azure output: ${name}`);
        this.template.outputs[name] = value;
      }
      this.roles.push(...(contribution.roleAssignments ?? []));
    }
    const custom = this.resources.customResources;
    for (const resource of Array.isArray(custom) ? custom : Object.values(custom)) this.addResource(resource);
  }

  /**
   * Add a resource, rejecting conflicting declarations.
   * @param resource - ARM resource declaration
   */
  protected addResource(resource: Record<string, any>): void {
    if (resource.properties?.principalId === this.getAppPrincipalId()) {
      resource.dependsOn = [...new Set([...(resource.dependsOn ?? []), this.getIdentityResourceId()])];
    }
    const previous = this.template.resources.find(item => item.type === resource.type && item.name === resource.name);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(resource))
        throw new WebdaError.BadRequest(`Conflicting Azure resource: ${resource.type}/${resource.name}`);
      return;
    }
    this.template.resources.push(resource);
  }

  /**
   * Grant every contributed role to one application or job identity.
   * @param principalId - ARM principal identifier expression
   * @param identityResourceId - Resource providing the managed identity
   */
  protected grantRoles(
    principalId = this.getAppPrincipalId(),
    identityResourceId = this.getIdentityResourceId()
  ): void {
    for (const role of this.roles) {
      const dependsOn = [identityResourceId];
      // Explicit dependency when the scoped resource is created in this template.
      for (const resource of this.template.resources) {
        if (typeof resource.type !== "string" || typeof resource.name !== "string" || resource.name.startsWith("["))
          continue;
        const names = resource.name.split("/"),
          types = resource.type.split("/");
        const absolute = `/subscriptions/${this.resources.subscriptionId}/resourceGroups/${this.resources.resourceGroup}/providers/${types[0]}/${names.map((name: string, index: number) => `${types[index + 1]}/${name}`).join("/")}`;
        const id = resourceId(resource.type, ...names);
        if (role.scope === id || role.scope === absolute) dependsOn.push(id);
      }
      this.addResource({
        type: "Microsoft.Authorization/roleAssignments",
        apiVersion: "2022-04-01",
        name: `[guid(${armValue(role.scope)}, ${armValue(role.roleDefinitionId)}, ${armValue(principalId)})]`,
        scope: role.scope,
        dependsOn,
        properties: { roleDefinitionId: role.roleDefinitionId, principalId, principalType: "ServicePrincipal" }
      });
    }
  }

  /**
   * Write a reviewable ARM template; this command never builds, pushes or deploys.
   * @param output - Optional template output path
   * @returns Generated ARM template
   */
  @Command("azure template", { description: "Generate an ARM template without deploying" })
  async generate(output?: string): Promise<AzureTemplate> {
    const template = this.generateTemplate();
    this.writeTemplate(output);
    return template;
  }

  /** Save the current template with secure parameters left as references.
   * @param output - Optional template output path
   */
  protected writeTemplate(output?: string): void {
    const target = output ?? this.resources.templateOutput;
    if (target) {
      const path = resolve(useApplication().applicationPath, target);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(this.template, null, 2) + "\n");
    }
  }

  /**
   * Deploy the ARM template with secure parameter values.
   * @returns Deployment outputs
   */
  async sendTemplate(): Promise<Record<string, any>> {
    const p = this.resources,
      credential = new AzureAuth(p).getCredential();
    const name = p.deploymentName ?? `webda-${this.getName()}-${Date.now()}`;
    const client = new DeploymentsClient(credential, p.subscriptionId);
    this.log("INFO", "Deploying Azure resources", p.resourceGroup, name);
    const parameters = Object.fromEntries(
      [...this.secretValues].map(([key, value]) => [
        key,
        { value: value instanceof SecretString ? value.getValue() : value }
      ])
    );
    try {
      if (p.createResourceGroup)
        await new ResourceManagementClient(credential, p.subscriptionId).resourceGroups.createOrUpdate(
          p.resourceGroup,
          { location: p.location, tags: this.getDefaultTags() }
        );
      const deployment = await client.deployments
        .createOrUpdate(p.resourceGroup, name, {
          properties: { mode: "Incremental", template: this.template, parameters }
        })
        .pollUntilDone();
      return deployment.properties?.outputs ?? {};
    } catch {
      const failed: string[] = [];
      try {
        for await (const operation of client.deploymentOperations.list(p.resourceGroup, name)) {
          if (operation.properties?.provisioningState === "Failed") {
            // Status messages may echo secure parameters; report only Azure's structured error code.
            const code = operation.properties.statusMessage?.error?.code;
            if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(code)) failed.push(code);
          }
        }
      } catch {
        /* Deployment diagnostics can be unavailable when authorization itself failed. */
      }
      throw new WebdaError.CodeError(
        "AZURE_DEPLOYMENT_FAILED",
        `Azure deployment failed${failed.length ? ` (${[...new Set(failed)].join(", ")})` : ""}; inspect deployment operations in the Azure portal`
      );
    }
  }
}
