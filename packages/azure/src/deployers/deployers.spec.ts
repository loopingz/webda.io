import { suite, test, timeout } from "@webda/test";
import { CronService, SecretString, Service, ServiceParameters, useApplication, useDynamicService } from "@webda/core";
import { expect, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { AzureContainerAppsDeployer, AzureContainerAppsDeployerParameters } from "./containerapps.service.js";
import { AzureFunctionsDeployer, AzureFunctionsDeployerParameters } from "./functions.service.js";
import { containerAppsSchedule, functionsSchedule, armLiteral, resourceId, armValue } from "../template.js";
import { AzureArmDeployer, AzureArmDeployerParameters } from "./arm.service.js";
import { executeServiceCommand } from "../../../core/src/services/servicecommands.js";
import { ContainerDeployer } from "@webda/oci";

const sdk = vi.hoisted(() => ({
  group: vi.fn(async () => ({})),
  deploy: vi.fn(async () => ({
    properties: { outputs: { fqdn: { value: "app.azure.test" }, latestRevisionName: { value: "revision1" } } }
  })),
  deployment: vi.fn(),
  diagnostics: vi.fn(async function* deploymentDiagnostics() {
    yield {
      properties: {
        provisioningState: "Failed",
        statusMessage: { error: { code: "InvalidTemplate", message: "private-secret" } }
      }
    };
  }),
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
        yield* await sdk.diagnostics();
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
class AdditionalContributor extends Service {
  getAzureResources(): any {
    return {};
  }
}
class SystemIdentityDeployer extends AzureArmDeployer {
  getAppResourceId() {
    return resourceId("Microsoft.Web/sites", "system-app");
  }
  getAppPrincipalId() {
    return `[reference(${armValue(this.getAppResourceId())}, '2024-04-01', 'Full').identity.principalId]`;
  }
  generateTemplate() {
    this.prepare();
    this.Resources();
    this.grantRoles();
    return this.template;
  }
}

@suite
class AzureDeployersTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Apps", AzureContainerAppsDeployer, AzureContainerAppsDeployerParameters);
    addAzureModda(app, "Test/Functions", AzureFunctionsDeployer, AzureFunctionsDeployerParameters);
    addAzureModda(app, "Test/Contributor", Contributor, ServiceParameters);
    addAzureModda(app, "Test/Additional", AdditionalContributor, ServiceParameters);
    addAzureModda(app, "Test/SystemIdentity", SystemIdentityDeployer, AzureArmDeployerParameters);
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
      Contributor: { type: "Test/Contributor" },
      Additional: { type: "Test/Additional" },
      SystemIdentity: { type: "Test/SystemIdentity", resourceGroup: "group", subscriptionId: "subscription" }
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

  @test async managedCertificatesAreBoundAfterValidation() {
    const apps = useDynamicService<AzureContainerAppsDeployer>("Apps");
    const previous = apps.parameters.customDomains;
    apps.parameters.customDomains = [{ name: "app.example.test" }];
    try {
      const template = apps.generateTemplate();
      const certificate = template.resources.find(
        resource => resource.type === "Microsoft.App/managedEnvironments/managedCertificates"
      )!;
      expect(certificate.properties).toEqual({ subjectName: "app.example.test", domainControlValidation: "CNAME" });
      const app = template.resources.find(resource => resource.type === "Microsoft.App/containerApps")!;
      expect(app.properties.configuration.ingress.customDomains[0].bindingType).toBe("Disabled");
      expect(app.properties.template.scale.minReplicas).toBe(1);
      const binding = template.resources.find(resource => resource.type === "Microsoft.Resources/deployments")!;
      expect(binding.properties.template.resources[0].properties.configuration.ingress.customDomains[0]).toMatchObject({
        bindingType: "SniEnabled",
        certificateId: expect.stringContaining("managedCertificates")
      });
      expect(JSON.stringify(binding)).not.toContain("private-secret");
      apps.parameters.containerApp.ingress = false;
      expect(() => apps.generateTemplate()).toThrow("public HTTP ingress");
    } finally {
      apps.parameters.customDomains = previous;
      delete apps.parameters.containerApp.ingress;
    }
  }

  @test async deploysAnImmutableImageAndKeepsTheReviewArtifact() {
    const apps = useDynamicService<AzureContainerAppsDeployer>("Apps");
    const push = vi.spyOn(ContainerDeployer.prototype, "push").mockResolvedValue("sha256:immutable");
    const dir = mkdtempSync(join(tmpdir(), "azure-deploy-"));
    const originalOutput = apps.parameters.templateOutput;
    apps.parameters.registryAuth = "aad";
    apps.parameters.templateOutput = join(dir, "deployed.json");
    try {
      const result = await apps.deploy();
      expect(result.image).toBe("test.azurecr.io/webda@sha256:immutable");
      expect(result.revision).toBe("revision1");
      expect(sdk.acr).toHaveBeenCalledWith("test.azurecr.io");
      expect(apps.parameters.credentials["test.azurecr.io"].identityToken).toBeInstanceOf(SecretString);
      expect(readFileSync(apps.parameters.templateOutput, "utf8")).toContain("@sha256:immutable");
      expect(readFileSync(apps.parameters.templateOutput, "utf8")).not.toContain("private-secret");
    } finally {
      push.mockRestore();
      apps.parameters.templateOutput = originalOutput;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  @timeout(10000)
  async waitsForOneDeployStatusAndRejectsUntrustedPollingLocations() {
    const functions = useDynamicService<AzureFunctionsDeployer>("Functions");
    functions.generateTemplate();
    const dir = mkdtempSync(join(tmpdir(), "azure-poll-")),
      path = join(dir, "app.zip");
    writeFileSync(path, "package");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      fetch
        .mockResolvedValueOnce(new Response(null, { status: 202, headers: { location: "/api/deployments/1" } }))
        .mockResolvedValueOnce(new Response(null, { status: 202 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 4 })));
      await functions.publish(path, "test-function.scm.azurewebsites.net");
      expect(String(fetch.mock.calls[1][0])).toBe("https://test-function.scm.azurewebsites.net/api/deployments/1");
      fetch
        .mockResolvedValueOnce(new Response(null, { status: 202, headers: { location: "/status" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 1 })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ complete: true })));
      await functions.publish(path, "test-function.scm.azurewebsites.net");
      fetch
        .mockResolvedValueOnce(new Response(null, { status: 202, headers: { location: "/status" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({})));
      await expect(functions.publish(path, "test-function.scm.azurewebsites.net")).rejects.toThrow("OneDeploy failed");
      fetch
        .mockResolvedValueOnce(new Response(null, { status: 202, headers: { location: "/status" } }))
        .mockResolvedValueOnce(new Response(null, { status: 503 }));
      await expect(functions.publish(path, "test-function.scm.azurewebsites.net")).rejects.toThrow("OneDeploy failed");
      fetch.mockResolvedValueOnce(
        new Response(null, { status: 202, headers: { location: "https://attacker.example/status" } })
      );
      await expect(functions.publish(path, "test-function.scm.azurewebsites.net")).rejects.toThrow("OneDeploy failed");
      fetch
        .mockResolvedValueOnce(new Response(null, { status: 202, headers: { location: "/status" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 3 })));
      await expect(functions.publish(path, "test-function.scm.azurewebsites.net")).rejects.toThrow("OneDeploy failed");
    } finally {
      vi.unstubAllGlobals();
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test async deploysTheFunctionsPackageAndRequiresAnArmScmOutput() {
    const functions = useDynamicService<AzureFunctionsDeployer>("Functions");
    const packageApp = vi
      .spyOn(functions, "packageApplication")
      .mockResolvedValue({ zipPath: "/app.zip", size: 1, files: 1 });
    const send = vi.spyOn(functions, "sendTemplate").mockResolvedValue({
      fqdn: { value: "function.azurewebsites.net" },
      hostNames: { value: ["function.scm.azurewebsites.net"] }
    });
    const publish = vi.spyOn(functions, "publish").mockResolvedValue(undefined);
    try {
      expect((await functions.deploy()).fqdn).toBe("function.azurewebsites.net");
      expect(publish).toHaveBeenCalledWith("/app.zip", "function.scm.azurewebsites.net");
      send.mockResolvedValueOnce({});
      await expect(functions.deploy()).rejects.toThrow("SCM hostname");
    } finally {
      packageApp.mockRestore();
      send.mockRestore();
      publish.mockRestore();
    }
  }

  @test templateValidationAndContributorConflicts() {
    const apps = useDynamicService<AzureContainerAppsDeployer>("Apps");
    const extra = useDynamicService<AdditionalContributor>("Additional");
    const p = apps.parameters;
    const saved = {
      image: p.image,
      registry: p.registry,
      subscriptionId: p.subscriptionId,
      name: p.containerApp.name,
      customResources: p.customResources
    };
    try {
      p.image = undefined;
      p.registry = "registry";
      expect(apps.getResolvedParameters().image).toContain("registry.azurecr.io/");
      p.registry = undefined;
      expect(() => apps.generateTemplate()).toThrow("image or registry");
      p.image = saved.image;
      p.containerApp.name = "INVALID";
      expect(() => apps.generateTemplate()).toThrow("Invalid Container App name");
      p.containerApp.name = saved.name;
      p.subscriptionId = "";
      expect(() => apps.generateTemplate()).toThrow("requires resourceGroup and subscriptionId");
      p.subscriptionId = saved.subscriptionId;
      const contribute = vi.spyOn(extra, "getAzureResources");
      contribute.mockReturnValueOnce({ env: { CONTRIBUTED: "conflict" } });
      expect(() => apps.generateTemplate()).toThrow("Conflicting Azure environment");
      sdk.contribution.mockReturnValueOnce({ outputs: { conflict: { type: "string", value: "first" } } } as any);
      contribute.mockReturnValueOnce({ outputs: { conflict: { type: "string", value: "second" } } });
      expect(() => apps.generateTemplate()).toThrow("Conflicting Azure output");
      contribute.mockRestore();
      p.customResources = [
        { type: "Custom/Resource", name: "same", properties: { a: 1 } },
        { type: "Custom/Resource", name: "same", properties: { a: 2 } }
      ];
      expect(() => apps.generateTemplate()).toThrow("Conflicting Azure resource");
      p.customResources = [
        { type: "Custom/Resource", name: "same", properties: { a: 1 } },
        { type: "Custom/Resource", name: "same", properties: { a: 1 } }
      ];
      expect(apps.generateTemplate().resources.filter(resource => resource.type === "Custom/Resource")).toHaveLength(1);
      const system = useDynamicService<SystemIdentityDeployer>("SystemIdentity");
      expect(
        system
          .generateTemplate()
          .resources.find(resource => resource.type === "Microsoft.Authorization/roleAssignments")!.dependsOn
      ).toContain(system.getAppResourceId());
    } finally {
      Object.assign(p, {
        image: saved.image,
        registry: saved.registry,
        subscriptionId: saved.subscriptionId,
        customResources: saved.customResources
      });
      p.containerApp.name = saved.name;
    }
  }

  @test async functionsRejectInvalidResourceSettings() {
    const functions = useDynamicService<AzureFunctionsDeployer>("Functions");
    const p = functions.parameters;
    const saved = { storageAccount: p.storageAccount, memory: p.memory, appSettings: p.appSettings };
    try {
      p.storageAccount = "INVALID";
      expect(() => functions.generateTemplate()).toThrow("valid functionApp and storageAccount");
      p.storageAccount = saved.storageAccount;
      p.memory = 1;
      expect(() => functions.generateTemplate()).toThrow("Invalid Functions Flex");
      p.memory = saved.memory;
      const extra = useDynamicService<AdditionalContributor>("Additional");
      const contribute = vi
        .spyOn(extra, "getAzureResources")
        .mockReturnValueOnce({ env: { PASSWORD: { secretRef: "secret" } } });
      const original = p.appSettings;
      p.appSettings = {};
      expect(() => functions.generateTemplate()).toThrow("Functions contributor settings");
      p.appSettings = original;
      contribute.mockRestore();
      const dir = mkdtempSync(join(tmpdir(), "azure-functions-template-"));
      try {
        await functions.generate(join(dir, "arm.json"));
        expect(readFileSync(join(dir, "arm.json"), "utf8")).toContain("functionAppConfig");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      Object.assign(p, saved);
    }
  }

  @test async armHandlesAbsentOutputsAndUnavailableOrUnsafeDiagnostics() {
    const functions = useDynamicService<AzureFunctionsDeployer>("Functions");
    functions.generateTemplate();
    sdk.group.mockClear();
    sdk.deploy.mockResolvedValueOnce({} as any);
    expect(await functions.sendTemplate()).toEqual({});
    sdk.deploy.mockResolvedValueOnce({ properties: {} } as any);
    expect(await functions.sendTemplate()).toEqual({});
    expect(sdk.group).not.toHaveBeenCalled();
    sdk.diagnostics.mockImplementationOnce(async function* unavailableErrorCodes() {
      yield {} as any;
      yield { properties: { provisioningState: "Succeeded" } } as any;
      yield { properties: { provisioningState: "Failed" } } as any;
      yield { properties: { provisioningState: "Failed", statusMessage: {} } } as any;
      for (const code of [undefined, 42, "unsafe private-secret"])
        yield { properties: { provisioningState: "Failed", statusMessage: { error: { code } } } } as any;
    });
    sdk.deploy.mockRejectedValueOnce(new Error("private-secret"));
    await expect(functions.sendTemplate()).rejects.toThrow(
      "Azure deployment failed; inspect deployment operations in the Azure portal"
    );
    sdk.diagnostics.mockRejectedValueOnce(new Error("permission denied"));
    sdk.deploy.mockRejectedValueOnce(new Error("private-secret"));
    await expect(functions.sendTemplate()).rejects.toThrow("Azure deployment failed; inspect deployment operations");
  }

  @test async optionalContainerAppSettingsAndContributorDependencies() {
    const apps = useDynamicService<AzureContainerAppsDeployer>("Apps");
    apps.generateTemplate();
    const p = apps.parameters;
    const saved = {
      image: p.image,
      registry: p.registry,
      registryAuth: p.registryAuth,
      environment: p.environment,
      logAnalytics: p.logAnalytics,
      crons: p.crons,
      secrets: p.secrets,
      customDomains: p.customDomains,
      customResources: p.customResources,
      containerApp: p.containerApp
    };
    const packageDescription = vi.spyOn(useApplication(), "getProjectInfo");
    try {
      packageDescription.mockReturnValue({ package: {} } as any);
      p.image = undefined;
      p.registry = "test";
      expect(apps.getResolvedParameters().image).toBe("test.azurecr.io/apps");
      packageDescription.mockRestore();
      p.image = "test.azurecr.io/webda:v1";
      p.registryAuth = "identity";
      p.environment = {};
      p.logAnalytics = false;
      p.crons = false;
      p.secrets = { vault: { keyVaultUrl: "https://test.vault.azure.net/secrets/password", identity: "system" } };
      p.containerApp = { ingress: false };
      p.customResources = {
        first: { type: "Custom/Resource", name: "first", properties: { principalId: apps.getAppPrincipalId() } },
        second: {
          type: "Custom/Resource",
          name: "second",
          dependsOn: ["existing"],
          properties: { principalId: apps.getAppPrincipalId() }
        }
      };
      let template = apps.generateTemplate();
      apps.LogAnalytics();
      const environment = template.resources.find(resource => resource.type === "Microsoft.App/managedEnvironments")!;
      expect(environment.dependsOn).toEqual([]);
      expect(environment.properties).toEqual({});
      expect(template.resources.some(resource => resource.type === "Microsoft.OperationalInsights/workspaces")).toBe(
        false
      );
      expect(template.resources.find(resource => resource.name === "second")!.dependsOn).toContain("existing");
      let app = template.resources.find(resource => resource.type === "Microsoft.App/containerApps")!;
      expect(app.properties.configuration.ingress).toBeUndefined();
      expect(app.properties.configuration.secrets[0]).toEqual({ name: "vault", ...p.secrets.vault });
      p.containerApp = {};
      p.customDomains = [
        { name: "app.example.test", certificateId: "/certificate" },
        { name: "other.example.test", certificateId: "/other", bindingType: "SniEnabled" }
      ];
      template = apps.generateTemplate();
      app = template.resources.find(resource => resource.type === "Microsoft.App/containerApps")!;
      expect(
        app.properties.configuration.ingress.customDomains.every(domain => domain.bindingType === "SniEnabled")
      ).toBe(true);
      p.customDomains = [{ name: "invalid/domain" }];
      expect(() => apps.generateTemplate()).toThrow("Invalid custom domain name");
      p.customDomains = [];
      p.logAnalytics = { name: "custom-logs", retentionInDays: 60 };
      template = apps.generateTemplate();
      expect(
        template.resources.find(resource => resource.type === "Microsoft.OperationalInsights/workspaces")!.properties
          .retentionInDays
      ).toBe(60);
      p.registryAuth = "none";
      p.image = `test.azurecr.io/webda@sha256:${"a".repeat(64)}`;
      const pinned = apps.generateTemplate();
      expect(
        pinned.resources.find(resource => resource.type === "Microsoft.App/containerApps")!.properties.template
          .containers[0].image
      ).toBe(p.image);
      const push = vi.spyOn(ContainerDeployer.prototype, "push").mockResolvedValue("sha256:noauth");
      sdk.acr.mockClear();
      try {
        await apps.deploy();
        expect(sdk.acr).not.toHaveBeenCalled();
      } finally {
        push.mockRestore();
      }
    } finally {
      packageDescription.mockRestore();
      Object.assign(p, saved);
    }
  }
}
