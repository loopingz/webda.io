import { Command, CronService, Deployer, SecretString, useApplication, useCore, WebdaError } from "@webda/core";
import { readFileSync } from "node:fs";
import { AzureAuth } from "../auth.js";
import { armValue, AzureTemplate, resourceId, roleAssignmentId } from "../template.js";
import { AzureArmDeployer, AzureArmDeployerParameters, AzureDeployResult } from "./arm.service.js";
import { AzureFunctionsPackageOptions, createAzureFunctionsPackage } from "./functionspackager.service.js";
import type { AzureTrigger } from "./functions-entrypoint.js";

/** Azure Functions Flex Consumption unit settings. */
export class AzureFunctionsDeployerParameters
  extends AzureArmDeployerParameters
  implements AzureFunctionsPackageOptions
{
  functionApp!: string;
  storageAccount!: string;
  plan?: string;
  zipPath = "dist/azure-functions.zip";
  memory = 2048;
  maximumInstanceCount = 100;
  appSettings: Record<string, string | SecretString> = {};
  triggers?: AzureTrigger[];
  deploymentTimeout = 600000;
}

/** Deploy a Node 22 Functions application with Flex Consumption OneDeploy.
 * @WebdaModda
 */
export class AzureFunctionsDeployer extends AzureArmDeployer<AzureFunctionsDeployerParameters> implements Deployer {
  static Parameters = AzureFunctionsDeployerParameters;

  /**
   * Write the generated ARM template for review.
   * @param output - Optional template output path
   * @returns Generated ARM template
   */
  @Command("azure template", { description: "Generate the Functions ARM template" })
  async generate(output?: string): Promise<AzureTemplate> {
    return super.generate(output);
  }

  /**
   * Build the Functions archive for this deployment unit.
   * @returns The package application result
   */
  @Command("azure package", { description: "Package the application for Azure Functions" })
  async packageApplication() {
    const p = this.getResolvedParameters();
    const crons = CronService.loadAnnotations(useCore().getServices()).map(cron => ({
      id: CronService.getExportId(cron),
      schedule: cron.cron
    }));
    return createAzureFunctionsPackage(useApplication(), {
      zipPath: p.zipPath,
      package: p.package,
      triggers: p.triggers,
      crons
    });
  }
  /**
   * Return the application resource identifier.
   * @returns The app resource id result
   */
  getAppResourceId(): string {
    return resourceId("Microsoft.Web/sites", this.resources.functionApp);
  }
  /**
   * Return the managed identity resource identifier.
   * @returns The identity resource id result
   */
  protected getIdentityResourceId(): string {
    return resourceId("Microsoft.ManagedIdentity/userAssignedIdentities", `${this.resources.functionApp}-identity`);
  }
  /**
   * Return the ARM expression for the application principal.
   * @returns The app principal id result
   */
  getAppPrincipalId(): string {
    return `[reference(${armValue(this.getIdentityResourceId())}, '2023-01-31').principalId]`;
  }

  /**
   * Generate the deployment template without contacting Azure.
   * @returns ARM template without secret values
   */
  generateTemplate(): AzureTemplate {
    this.prepare();
    const p = this.resources;
    if (!/^[a-z0-9]{3,24}$/.test(p.storageAccount) || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]$/.test(p.functionApp))
      throw new WebdaError.BadRequest("Functions requires valid functionApp and storageAccount names");
    if (
      ![512, 2048, 4096].includes(p.memory) ||
      !Number.isInteger(p.maximumInstanceCount) ||
      p.maximumInstanceCount < 40 ||
      p.maximumInstanceCount > 1000
    )
      throw new WebdaError.BadRequest("Invalid Functions Flex memory or instance count");
    const storage = resourceId("Microsoft.Storage/storageAccounts", p.storageAccount),
      planName = p.plan ?? `${p.functionApp}-plan`;
    this.addResource({
      type: "Microsoft.ManagedIdentity/userAssignedIdentities",
      apiVersion: "2023-01-31",
      name: `${p.functionApp}-identity`,
      location: p.location,
      tags: this.getDefaultTags()
    });
    this.addResource({
      type: "Microsoft.Storage/storageAccounts",
      apiVersion: "2023-05-01",
      name: p.storageAccount,
      location: p.location,
      kind: "StorageV2",
      sku: { name: "Standard_LRS" },
      tags: this.getDefaultTags(),
      properties: {
        supportsHttpsTrafficOnly: true,
        minimumTlsVersion: "TLS1_2",
        allowBlobPublicAccess: false,
        allowSharedKeyAccess: false
      }
    });
    this.addResource({
      type: "Microsoft.Storage/storageAccounts/blobServices/containers",
      apiVersion: "2023-05-01",
      name: `${p.storageAccount}/default/deployments`,
      dependsOn: [storage],
      properties: { publicAccess: "None" }
    });
    this.addResource({
      type: "Microsoft.Web/serverfarms",
      apiVersion: "2024-04-01",
      name: planName,
      location: p.location,
      kind: "functionapp",
      sku: { tier: "FlexConsumption", name: "FC1" },
      properties: { reserved: true },
      tags: this.getDefaultTags()
    });
    this.Resources();
    for (const role of ["b7e6dc6d-f1e8-4753-8033-0f276bb0955b", "974c5e8b-45b9-4653-ba55-5f855dd0fb88"])
      this.roles.push({
        scope: storage,
        roleDefinitionId: `/subscriptions/${p.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${role}`
      });
    this.grantRoles();
    const clientId = `[reference(${armValue(this.getIdentityResourceId())}, '2023-01-31').clientId]`;
    const settings: Record<string, any> = {
      ...this.contributedEnv,
      FUNCTIONS_WORKER_RUNTIME: "node",
      AzureWebJobsStorage__accountName: p.storageAccount,
      AzureWebJobsStorage__credential: "managedidentity",
      AzureWebJobsStorage__clientId: clientId,
      AZURE_CLIENT_ID: clientId,
      ...p.appSettings
    };
    const appSettings = Object.entries(settings).map(([name, value]) => {
      if (typeof value === "object" && !(value instanceof SecretString))
        throw new WebdaError.BadRequest(
          "Functions contributor settings must use Key Vault references or appSettings SecretString values"
        );
      return { name, value: value instanceof SecretString ? this.secureParameter(value) : value };
    });
    this.addResource({
      type: "Microsoft.Web/sites",
      apiVersion: "2024-04-01",
      name: p.functionApp,
      location: p.location,
      kind: "functionapp,linux",
      tags: this.getDefaultTags(),
      identity: {
        type: "SystemAssigned, UserAssigned",
        userAssignedIdentities: { [this.getIdentityResourceId()]: {} }
      },
      dependsOn: [
        storage,
        this.getIdentityResourceId(),
        resourceId("Microsoft.Web/serverfarms", planName),
        resourceId(
          "Microsoft.Storage/storageAccounts/blobServices/containers",
          p.storageAccount,
          "default",
          "deployments"
        ),
        ...this.template.resources
          .filter(resource => resource.type === "Microsoft.Authorization/roleAssignments")
          .map(roleAssignmentId)
      ],
      properties: {
        serverFarmId: resourceId("Microsoft.Web/serverfarms", planName),
        httpsOnly: true,
        siteConfig: { appSettings, minTlsVersion: "1.2" },
        functionAppConfig: {
          runtime: { name: "node", version: "22" },
          scaleAndConcurrency: { instanceMemoryMB: p.memory, maximumInstanceCount: p.maximumInstanceCount },
          deployment: {
            storage: {
              type: "blobContainer",
              value: `https://${p.storageAccount}.blob.core.windows.net/deployments`,
              authentication: {
                type: "UserAssignedIdentity",
                userAssignedIdentityResourceId: this.getIdentityResourceId()
              }
            }
          }
        }
      }
    });
    this.template.outputs.fqdn = {
      type: "string",
      value: `[reference(${armValue(this.getAppResourceId())}, '2024-04-01').defaultHostName]`
    };
    this.template.outputs.hostNames = {
      type: "array",
      value: `[reference(${armValue(this.getAppResourceId())}, '2024-04-01').enabledHostNames]`
    };
    return this.template;
  }

  /**
   * Flex Consumption accepts OneDeploy packages at /api/publish.
   * @param zipPath - Path of the Functions deployment archive
   * @param scmHost - Trusted Azure SCM hostname
   */
  async publish(zipPath: string, scmHost: string): Promise<void> {
    if (!/^[a-zA-Z0-9-]+\.scm\.(?:[a-zA-Z0-9-]+\.)?azurewebsites\.net$/.test(scmHost))
      throw new WebdaError.BadRequest("Invalid Azure Functions SCM hostname");
    const auth = new AzureAuth(this.resources);
    const headers = { Authorization: `Bearer ${await auth.getArmToken()}`, "Content-Type": "application/zip" };
    const origin = `https://${scmHost}`;
    const deadline = Date.now() + this.resources.deploymentTimeout;
    try {
      let response = await fetch(`${origin}/api/publish?type=zip&remoteBuild=false`, {
        method: "POST",
        headers,
        body: readFileSync(zipPath),
        redirect: "error",
        signal: AbortSignal.timeout(this.resources.deploymentTimeout)
      });
      if (!response.ok) throw new Error();
      let location = response.headers.get("location");
      if (response.status === 202 && !location) throw new Error();
      while (location) {
        const url = new URL(location, origin);
        if (url.origin !== origin || url.username || url.password || Date.now() >= deadline) throw new Error();
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${await auth.getArmToken()}` },
          redirect: "error",
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now()))
        });
        if (!response.ok) throw new Error();
        if (response.status === 202) continue;
        const status = (await response.json()) as { status?: number; complete?: boolean; failed?: boolean };
        if (status.failed || status.status === 3) throw new Error();
        if (status.status === 4 || status.complete === true) break;
        if (status.status === undefined) throw new Error();
        location = response.headers.get("location") ?? location;
      }
    } catch {
      throw new WebdaError.CodeError(
        "AZURE_FUNCTIONS_PUBLISH_FAILED",
        "Azure Functions OneDeploy failed; inspect the deployment status in the Azure portal"
      );
    }
  }

  /**
   * Publish and deploy the application, returning its endpoints.
   * @returns The deploy result
   */
  @Command("deploy", { description: "Package and deploy to Azure Functions Flex Consumption" })
  async deploy(): Promise<AzureDeployResult> {
    this.generateTemplate();
    this.writeTemplate();
    const packaged = await this.packageApplication();
    const outputs = await this.sendTemplate();
    const scm = (outputs.hostNames?.value as string[] | undefined)?.find(host => host.includes(".scm."));
    if (!scm) throw new WebdaError.CodeError("AZURE_FUNCTIONS_SCM", "ARM did not return a Functions SCM hostname");
    await this.publish(packaged.zipPath, scm);
    return (this.result = { fqdn: outputs.fqdn?.value, outputs });
  }
}
