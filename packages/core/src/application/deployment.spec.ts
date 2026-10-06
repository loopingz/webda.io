import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWithInstanceStorage } from "../core/instancestorage.js";
import { UnpackedApplication } from "./unpackedapplication.js";
import {
  applyDeployment,
  getDeploymentFile,
  getDeploymentUnitServices,
  loadDeployment,
  mergeDeploymentUnits
} from "./deployment.js";

/**
 * Create an application folder with deployments
 * @param deployments - deployment name to content
 * @returns the application path
 */
function createAppFolder(deployments: Record<string, any> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "webda-deployment-"));
  writeFileSync(
    join(dir, "webda.config.json"),
    JSON.stringify({
      version: 4,
      parameters: { apiUrl: "http://localhost:18080", list: ["a", "b"] },
      services: { store: { type: "Webda/MemoryStore", table: "global" } }
    })
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "deployment-test", version: "1.0.0" }));
  mkdirSync(join(dir, "deployments"));
  for (const [name, content] of Object.entries(deployments)) {
    writeFileSync(join(dir, "deployments", `${name}.json`), JSON.stringify(content));
  }
  return dir;
}

@suite
class DeploymentTest {
  @test
  loadDeploymentFile() {
    const dir = createAppFolder({ Production: { parameters: { apiUrl: "https://api" } } });
    try {
      assert.strictEqual(getDeploymentFile(dir, "Production"), join(dir, "deployments", "Production.json"));
      assert.deepStrictEqual(loadDeployment(dir, "Production").parameters, { apiUrl: "https://api" });
      assert.throws(() => loadDeployment(dir, "Unknown"), /Deployment 'Unknown' not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  applyDeploymentOverrides() {
    const configuration: any = {
      version: 4,
      parameters: { apiUrl: "http://localhost:18080", list: ["a", "b"], nested: { a: 1, b: 2 } },
      services: { store: { type: "Webda/MemoryStore", table: "global", options: { x: 1 } } }
    };
    applyDeployment(configuration, {
      parameters: { apiUrl: "https://api", list: ["c"], nested: { b: 3 } },
      services: { store: { type: "Webda/DynamoStore", options: { y: 2 } }, other: { type: "Webda/Other" } }
    });
    assert.deepStrictEqual(configuration.parameters, {
      apiUrl: "https://api",
      // Arrays are replaced, not concatenated
      list: ["c"],
      nested: { a: 1, b: 3 }
    });
    assert.deepStrictEqual(configuration.services.store, {
      type: "Webda/DynamoStore",
      table: "global",
      options: { x: 1, y: 2 }
    });
    assert.deepStrictEqual(configuration.services.other, { type: "Webda/Other" });
  }

  @test
  unitServices() {
    const services = getDeploymentUnitServices(
      {
        resources: { region: "us-east-1", Tags: { team: "a" } },
        units: [
          { name: "Stack", type: "CloudFormationDeployer", region: "eu-west-1", Tags: { app: "b" } },
          { name: "Image", type: "MyApp/ImageBuilder" }
        ]
      },
      type => (type.includes("/") ? type : `Webda/${type}`)
    );
    assert.deepStrictEqual(services, {
      Stack: { type: "Webda/CloudFormationDeployer", region: "eu-west-1", Tags: { team: "a", app: "b" } },
      Image: { type: "MyApp/ImageBuilder", region: "us-east-1", Tags: { team: "a" } }
    });
    assert.throws(() => getDeploymentUnitServices({ units: [{ type: "X" } as any] }), /must have a name and a type/);
    assert.throws(
      () =>
        getDeploymentUnitServices({
          units: [
            { name: "A", type: "X" },
            { name: "A", type: "Y" }
          ]
        }),
      /declared twice/
    );
  }

  @test
  mergeUnits() {
    const configuration: any = { version: 4, parameters: {}, services: { store: { type: "Webda/MemoryStore" } } };
    mergeDeploymentUnits(configuration, { Stack: { type: "Webda/CloudFormationDeployer" } });
    assert.deepStrictEqual(configuration.services.Stack, { type: "Webda/CloudFormationDeployer" });
    assert.throws(
      () => mergeDeploymentUnits(configuration, { store: { type: "Webda/CloudFormationDeployer" } }),
      /Deployment unit 'store' conflicts with the application service 'store'/
    );
  }

  @test
  async applicationDeployment() {
    const dir = createAppFolder({
      Production: {
        parameters: { apiUrl: "https://api" },
        services: { store: { table: "prod" } },
        units: [{ name: "Stack", type: "Webda/CloudFormationDeployer" }]
      }
    });
    try {
      await runWithInstanceStorage({}, async () => {
        const app = new UnpackedApplication(dir);
        app.setCurrentDeployment("Production");
        await app.load();
        const configuration = app.getConfiguration();
        assert.strictEqual(configuration.parameters.apiUrl, "https://api");
        assert.strictEqual(configuration.services.store.table, "prod");
        assert.strictEqual(configuration.services.store.type, "Webda/MemoryStore");
        // Units are never part of the application services
        assert.strictEqual(configuration.services.Stack, undefined);
        assert.strictEqual(app.getCurrentDeployment(), "Production");
        assert.deepStrictEqual(app.getDeployment().units, [{ name: "Stack", type: "Webda/CloudFormationDeployer" }]);
        assert.strictEqual(app.deploymentFile, join(dir, "deployments", "Production.json"));
      });
      // The WEBDA_DEPLOYMENT environment variable selects the deployment by default
      process.env.WEBDA_DEPLOYMENT = "Production";
      await runWithInstanceStorage({}, async () => {
        const app = new UnpackedApplication(dir);
        await app.load();
        assert.strictEqual(app.getConfiguration().parameters.apiUrl, "https://api");
      });
      process.env.WEBDA_DEPLOYMENT = "Unknown";
      await runWithInstanceStorage({}, async () => {
        await assert.rejects(() => new UnpackedApplication(dir).load(), /Deployment 'Unknown' not found/);
      });
    } finally {
      delete process.env.WEBDA_DEPLOYMENT;
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
