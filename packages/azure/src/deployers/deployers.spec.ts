import { suite, test } from "@webda/test";
import { CronService, SecretString, Service, ServiceParameters, useDynamicService } from "@webda/core";
import { expect, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { AzureContainerAppsDeployer, AzureContainerAppsDeployerParameters } from "./containerapps.service.js";
import { AzureFunctionsDeployer, AzureFunctionsDeployerParameters } from "./functions.service.js";
import { containerAppsSchedule, functionsSchedule, armLiteral } from "../template.js";
import { executeServiceCommand } from "../../../core/src/services/servicecommands.js";

const sdk = vi.hoisted(() => ({
  group: vi.fn(async () => ({})),
  deploy: vi.fn(async () => ({
    properties: { outputs: { fqdn: { value: "app.azure.test" }, latestRevisionName: { value: "revision1" } } }
  })),
  deployment: vi.fn(),
  contribution: vi.fn(() => ({
    resources: [],
    env: { CONTRIBUTED: "yes" },
    roleAssignments: [
      {
        scope: "[resourceId('Microsoft.Storage/storageAccounts', 'test')]",
        roleDefinitionId: "/subscriptions/s/providers/Microsoft.Authorization/roleDefinitions/role"
      }
    ]
  })),
  credential: {},
  acr: vi.fn(async () => "refresh"),
  token: vi.fn(async () => "arm-token")
}));
vi.mock("@azure/arm-resources", () => ({
  ResourceManagementClient: class {
    resourceGroups = { createOrUpdate: sdk.group };
  }
}));
vi.mock("@azure/arm-resourcesdeployments", () => ({
  DeploymentsClient: class {
    deployments = {
      createOrUpdate(...args) {
        sdk.deployment(...args);
        return { pollUntilDone: sdk.deploy };
      }
    };
    deploymentOperations = {
      async *list() {
        yield {
          properties: {
            provisioningState: "Failed",
            statusMessage: { error: { code: "InvalidTemplate", message: "private-secret" } }
          }
        };
      }
    };
  }
}));
vi.mock("../auth.js", () => ({
  AzureAuth: class {
    getCredential() {
      return sdk.credential;
    }
    getAcrRefreshToken = sdk.acr;
    getArmToken = sdk.token;
  }
}));
class Contributor extends Service {
  getAzureResources = sdk.contribution;
}

@suite
class AzureDeployersTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Apps", AzureContainerAppsDeployer, AzureContainerAppsDeployerParameters);
    addAzureModda(app, "Test/Functions", AzureFunctionsDeployer, AzureFunctionsDeployerParameters);
    addAzureModda(app, "Test/Contributor", Contributor, ServiceParameters);
    Object.assign(app.getCurrentConfiguration().services, {
      Apps: {
        type: "Test/Apps",
        resourceGroup: "group",
        subscriptionId: "subscription",
        image: "test.azurecr.io/webda",
        createResourceGroup: true,
        containerApp: { env: { PASSWORD: { secretRef: "password" } } },
        secrets: { password: new SecretString("private-secret", "test"), plain: "private-plain" }
      },
      Functions: {
        type: "Test/Functions",
        resourceGroup: "group",
        subscriptionId: "subscription",
        functionApp: "test-function",
        storageAccount: "teststorage",
        appSettings: { PASSWORD: new SecretString("private-secret", "test") }
      },
      Contributor: { type: "Test/Contributor" }
    });
  }

  @test async containerAppsTemplateAndSecureDeployment() {
    const apps = useDynamicService<AzureContainerAppsDeployer>("Apps");
    const cron = vi
      .spyOn(CronService, "loadAnnotations")
      .mockReturnValue([{ cron: "0 * * * * *", serviceName: "Cron", method: "run", args: [], description: "" }] as any);
    const template = apps.generateTemplate("test.azurecr.io/webda@sha256:123");
    const app = template.resources.find(resource => resource.type === "Microsoft.App/containerApps")!;
    expect(app.properties.template.containers[0].image).toContain("@sha256:123");
    expect(app.properties.template.containers[0].command).toBeUndefined();
    expect(app.properties.template.containers[0].env).toContainEqual({ name: "CONTRIBUTED", value: "yes" });
    expect(app.properties.configuration.registries[0].identity).toContain("userAssignedIdentities");
    expect(
      template.resources.find(resource => resource.type === "Microsoft.App/jobs")!.properties.template.containers[0]
        .args
    ).toEqual(["cron", "run", "--id", expect.any(String)]);
    expect(JSON.stringify(template)).not.toContain("private-secret");
    expect(JSON.stringify(template)).not.toContain("private-plain");
    expect(Object.values(template.parameters).every(parameter => parameter.type === "secureString")).toBe(true);
    expect(apps.getResolvedParameters().secrets.password).toBeInstanceOf(SecretString);
    await apps.sendTemplate();
    expect(sdk.group).toHaveBeenCalledWith("group", expect.objectContaining({ location: "westeurope" }));
    expect(sdk.deployment.mock.calls.at(-1)![2].properties.parameters.secret0.value).toBe("private-secret");
    sdk.deploy.mockRejectedValueOnce(new Error("private-secret"));
    await expect(apps.sendTemplate()).rejects.toThrow("InvalidTemplate");
    cron.mockRestore();
    apps.parameters.environment.id = "/existing/environment";
    apps.parameters.registryAuth = "none";
    const existing = apps.generateTemplate();
    expect(existing.resources.some(resource => resource.type === "Microsoft.App/managedEnvironments")).toBe(false);
    expect(existing.resources.some(resource => resource.type === "Microsoft.OperationalInsights/workspaces")).toBe(
      false
    );
    const dir = mkdtempSync(join(tmpdir(), "azure-template-"));
    try {
      await apps.generate(join(dir, "template.json"));
      expect(JSON.parse(readFileSync(join(dir, "template.json"), "utf8")).resources.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test async functionsFlexTemplateAndOneDeploy() {
    const functions = useDynamicService<AzureFunctionsDeployer>("Functions");
    const template = functions.generateTemplate();
    const app = template.resources.find(resource => resource.type === "Microsoft.Web/sites")!;
    expect(app.properties.functionAppConfig.runtime).toEqual({ name: "node", version: "22" });
    expect(app.properties.functionAppConfig.deployment.storage.authentication.type).toBe("UserAssignedIdentity");
    expect(template.resources.find(resource => resource.type === "Microsoft.Web/serverfarms")!.sku.name).toBe("FC1");
    expect(JSON.stringify(template)).not.toContain("private-secret");
    const dir = mkdtempSync(join(tmpdir(), "azure-publish-"));
    try {
      const path = join(dir, "app.zip");
      writeFileSync(path, "package");
      const fetch = vi.fn(async () => new Response(null, { status: 200 }));
      vi.stubGlobal("fetch", fetch);
      await functions.publish(path, "test-function.scm.azurewebsites.net");
      expect(fetch.mock.calls[0][0]).toContain("/api/publish?type=zip&remoteBuild=false");
      expect(fetch.mock.calls[0][1].body).toEqual(Buffer.from("package"));
      await expect(functions.publish(path, "evil.example")).rejects.toThrow("SCM hostname");
      fetch.mockResolvedValueOnce(new Response("private-secret", { status: 403 }));
      await expect(functions.publish(path, "test-function.scm.azurewebsites.net")).rejects.toThrow("OneDeploy failed");
      fetch.mockResolvedValueOnce(new Response(null, { status: 202 }));
      await expect(functions.publish(path, "test-function.scm.azurewebsites.net")).rejects.toThrow("OneDeploy failed");
    } finally {
      vi.unstubAllGlobals();
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test async overriddenDeployRunsOnce() {
    const apps = useDynamicService<AzureContainerAppsDeployer>("Apps");
    const deploy = vi.spyOn(apps, "deploy").mockResolvedValue({ outputs: {} });
    const info = {
      args: {},
      services: [
        { name: "Webda/ContainerDeployer", type: "Webda/ContainerDeployer", method: "deploy" },
        { name: "Webda/AzureContainerAppsDeployer", type: "Webda/AzureContainerAppsDeployer", method: "deploy" }
      ]
    } as any;
    await executeServiceCommand("deploy", info, {}, { Apps: apps });
    expect(deploy).toHaveBeenCalledTimes(1);
    deploy.mockRestore();
    expect(containerAppsSchedule("0 * * * * *")).toBe("* * * * *");
    expect(functionsSchedule("* * * * *")).toBe("0 * * * * *");
    expect(() => containerAppsSchedule("* * * * * *")).toThrow("seconds set to 0");
    expect(() => functionsSchedule("* *")).toThrow("five or six");
    expect(armLiteral("a'b")).toBe("'a''b'");
  }
}
