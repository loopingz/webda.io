import { execFileSync } from "node:child_process";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  getDeployedConfiguration,
  PACKAGED_CONFIGURATION,
  PACKAGED_MARKER,
  packageApplication,
  writeApplicationPackage
} from "./packager.js";

/**
 * Write a file, creating its folders
 * @param file - the file path
 * @param content - the content, objects are written as JSON
 */
function write(file: string, content: any = "") {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

/**
 * Write a package
 * @param dir - the package folder
 * @param pkg - the package.json content
 * @param files - other files relative to the folder
 */
function writePackage(dir: string, pkg: any, files: string[] = ["index.js"]) {
  write(join(dir, "package.json"), pkg);
  files.forEach(file => write(join(dir, file), `// ${pkg.name} ${file}`));
}

@suite
class PackagerTest {
  root: string;
  appPath: string;

  /**
   * Create a workspace: the app, a linked workspace package, npm and pnpm style dependencies
   *
   * app -> a@1 (npm, depends on b@2), b@1 (pnpm symlink), lib (workspace link, depends on c), d (missing, optional)
   */
  async beforeEach() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), "webda-packager-")));
    this.appPath = join(this.root, "app");
    writePackage(
      this.appPath,
      {
        name: "app",
        version: "1.0.0",
        type: "module",
        dependencies: { a: "1", b: "1", lib: "workspace:*" },
        optionalDependencies: { d: "1" },
        devDependencies: { dev: "1" }
      },
      ["lib/app.js", "lib/app.d.ts", "src/app.ts", "README.md", ".env", "webda.config.jsonc", "deployments/Prod.json"]
    );
    // npm style: a depends on b@2 nested in its own node_modules
    writePackage(join(this.appPath, "node_modules/a"), { name: "a", version: "1.0.0", dependencies: { b: "2" } });
    writePackage(join(this.appPath, "node_modules/a/node_modules/b"), { name: "b", version: "2.0.0" });
    // pnpm style: b@1 is a symlink to the store
    writePackage(join(this.root, "node_modules/.pnpm/b@1.0.0/node_modules/b"), { name: "b", version: "1.0.0" }, [
      "index.js",
      "lib/b.js"
    ]);
    symlinkSync(join(this.root, "node_modules/.pnpm/b@1.0.0/node_modules/b"), join(this.appPath, "node_modules/b"));
    // workspace link: only the package.json `files` are packaged
    writePackage(
      join(this.root, "packages/lib"),
      { name: "lib", version: "1.0.0", files: ["lib"], dependencies: { c: "1" } },
      ["lib/index.js", "src/index.ts"]
    );
    symlinkSync(join(this.root, "packages/lib"), join(this.appPath, "node_modules/lib"));
    // c is hoisted at the workspace root
    writePackage(join(this.root, "node_modules/c"), { name: "c", version: "1.0.0" });
    writePackage(join(this.appPath, "node_modules/dev"), { name: "dev", version: "1.0.0" });
  }

  async afterEach() {
    rmSync(this.root, { recursive: true, force: true });
  }

  /**
   * Fake application loaded from the workspace
   * @returns the application
   */
  getApp(): any {
    const appPath = this.appPath;
    return {
      applicationPath: appPath,
      getCurrentDeployment: () => "Prod",
      getDeployment: () => ({ units: [{ name: "Stack", type: "Webda/CloudFormationDeployer" }] }),
      getConfiguration: () => ({
        version: 4,
        parameters: { apiUrl: "https://api" },
        services: { store: { type: "Webda/MemoryStore" }, Stack: { type: "Webda/CloudFormationDeployer" } },
        cachedModules: {
          project: { package: { name: "app", version: "1.0.0" }, webda: {}, deployment: { name: "Prod" } },
          moddas: {
            "Webda/MemoryStore": { Import: "../packages/lib/lib/index:MemoryStore" },
            "App/Local": { Import: "lib/app:Local" },
            "B/Service": { Import: "../node_modules/.pnpm/b@1.0.0/node_modules/b/lib/b:Service" }
          },
          beans: {},
          models: { "App/Model": { Import: "lib/app:Model" } },
          schemas: {}
        }
      })
    };
  }

  @test
  async files() {
    const { files } = await packageApplication(this.getApp());
    const targets = files.map(file => file.target).sort();
    assert.deepStrictEqual(targets, [
      ".webda/packaged.json",
      "lib/app.js",
      "node_modules/a/index.js",
      "node_modules/a/node_modules/b/index.js",
      "node_modules/a/node_modules/b/package.json",
      "node_modules/a/package.json",
      "node_modules/b/index.js",
      "node_modules/b/lib/b.js",
      "node_modules/b/package.json",
      "node_modules/c/index.js",
      "node_modules/c/package.json",
      "node_modules/lib/lib/index.js",
      "node_modules/lib/package.json",
      "package.json",
      "webda.config.json"
    ]);
    // Symlinked packages are copied from their real location
    assert.strictEqual(
      files.find(file => file.target === "node_modules/b/lib/b.js").source,
      join(this.root, "node_modules/.pnpm/b@1.0.0/node_modules/b/lib/b.js")
    );
  }

  @test
  async options() {
    const { files } = await packageApplication(this.getApp(), {
      ignores: ["lib"],
      excludePatterns: ["index\\.js$"],
      modules: { excludes: ["a"], includes: ["dev"] }
    });
    const targets = files.map(file => file.target).sort();
    assert.ok(!targets.includes("lib/app.js"));
    assert.ok(!targets.some(target => target.endsWith("index.js")));
    assert.ok(!targets.some(target => target.startsWith("node_modules/a/")));
    assert.ok(targets.includes("node_modules/dev/package.json"));
  }

  @test
  async reproducible() {
    // A committed workspace: the packaged configuration bakes the git information
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.email=test@webda.io", "-c", "user.name=test", ...args], {
        cwd: this.root,
        stdio: "pipe"
      });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "init");
    const contents = async () =>
      (await packageApplication(this.getApp())).files.map(file => [file.target, file.source, file.content?.toString()]);
    const first = await contents();
    await new Promise(resolve => setTimeout(resolve, 10));
    // Packaging the same sources later gives the same files
    assert.deepStrictEqual(await contents(), first);
  }

  @test
  async configuration() {
    const { files, configuration } = await packageApplication(this.getApp());
    // Deployment units are not part of the packaged application
    assert.deepStrictEqual(Object.keys(configuration.services), ["store"]);
    // Imports point to the packaged files
    assert.strictEqual(
      configuration.cachedModules.moddas["Webda/MemoryStore"].Import,
      "node_modules/lib/lib/index:MemoryStore"
    );
    assert.strictEqual(configuration.cachedModules.moddas["App/Local"].Import, "lib/app:Local");
    assert.strictEqual(configuration.cachedModules.moddas["B/Service"].Import, "node_modules/b/lib/b:Service");
    assert.strictEqual(configuration.cachedModules.models["App/Model"].Import, "lib/app:Model");
    assert.strictEqual(configuration.cachedModules.project.deployment.name, "Prod");
    assert.ok(configuration.cachedModules.project.git);
    const written = JSON.parse(files.find(file => file.target === PACKAGED_CONFIGURATION).content.toString());
    assert.deepStrictEqual(written, configuration);
    const marker = JSON.parse(files.find(file => file.target === PACKAGED_MARKER).content.toString());
    assert.strictEqual(marker.deployment, "Prod");
  }

  @test
  async excludeServices() {
    // A service injected by the CLI to run a command is not part of the packaged application
    const { configuration } = await packageApplication(this.getApp(), { excludeServices: ["store"] });
    assert.deepStrictEqual(Object.keys(configuration.services), []);
  }

  @test
  deployedConfiguration() {
    const configuration = getDeployedConfiguration(this.getApp(), { excludeServices: ["store"] });
    assert.deepStrictEqual(Object.keys(configuration.services), [], "units and excluded services are removed");
    // Imports stay valid in the source tree
    assert.strictEqual(
      configuration.cachedModules.moddas["Webda/MemoryStore"].Import,
      "../packages/lib/lib/index:MemoryStore"
    );
    assert.strictEqual(configuration.cachedModules.project.deployment.name, "Prod");
    assert.ok(configuration.cachedModules.project.git);
    assert.ok(
      !this.getApp().getConfiguration().cachedModules.project.git,
      "the application configuration is untouched"
    );
  }

  @test
  async writePackage() {
    const output = join(this.root, "dist");
    const pkg = await packageApplication(this.getApp());
    writeApplicationPackage(pkg, output);
    assert.strictEqual(readFileSync(join(output, "node_modules/b/lib/b.js"), "utf-8"), "// b lib/b.js");
    assert.deepStrictEqual(JSON.parse(readFileSync(join(output, PACKAGED_CONFIGURATION), "utf-8")), pkg.configuration);
    assert.ok(existsSync(join(output, PACKAGED_MARKER)));
    // Never overwrite a previous package
    assert.throws(() => writeApplicationPackage(pkg, output), /not empty/);
    // An empty folder is fine
    const empty = join(this.root, "empty");
    mkdirSync(empty);
    writeApplicationPackage(pkg, empty);
    assert.ok(existsSync(join(empty, "package.json")));
  }

  @test
  async writePackageKeepsExecutableBit() {
    write(join(this.appPath, "lib/cli.js"), "#!/usr/bin/env node");
    chmodSync(join(this.appPath, "lib/cli.js"), 0o755);
    const output = join(this.root, "dist");
    writeApplicationPackage(await packageApplication(this.getApp()), output);
    assert.ok(statSync(join(output, "lib/cli.js")).mode & 0o100);
    assert.ok(!(statSync(join(output, "lib/app.js")).mode & 0o100));
  }
}
