import { suite, test } from "@webda/test";
import * as assert from "assert";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldDispatchBuildHooks } from "@webda/compiler/lib/shell-build-dispatch.js";
import { listConfiguredServiceTypes } from "@webda/utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve key fixtures from the repo layout. These paths are stable:
// - packages/grpc/webda.module.json is produced by `webdac build` against this package
// - sample-apps/blog-system is a tracked fixture that configures Webda/GrpcService
const GRPC_PKG_ROOT = resolve(__dirname, "..");
const GRPC_MODULE_JSON = join(GRPC_PKG_ROOT, "webda.module.json");
const BLOG_SYSTEM_DIR = resolve(GRPC_PKG_ROOT, "..", "..", "sample-apps", "blog-system");

/**
 * End-to-end-ish checks for the build-hook dispatch flow:
 *
 *   webdac build
 *     → reads webda.module.json
 *     → reads webda.config.json
 *     → shouldDispatchBuildHooks(module, configuredTypes) === true
 *     → spawns `webda build`
 *     → GrpcService.build() writes .webda/app.proto
 *
 * The decision-helpers (listConfiguredServiceTypes, shouldDispatchBuildHooks) each
 * have focused unit tests in their home packages. The tests below verify their
 * *composition* against the real grpc webda.module.json — so a refactor that
 * breaks either piece for this specific user journey fails here.
 */
@suite
class GrpcBuildDispatchIntegrationTest {
  private tmpDir!: string;

  beforeEach() {
    this.tmpDir = join(tmpdir(), `grpc-build-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(this.tmpDir, { recursive: true });
  }

  afterEach() {
    try {
      rmSync(this.tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
  }

  /**
   * Write a minimal webda.config.json and return its absolute path.
   */
  private writeConfig(services: Record<string, { type: string }>): string {
    const configPath = join(this.tmpDir, "webda.config.json");
    writeFileSync(configPath, JSON.stringify({ services }, null, 2));
    return configPath;
  }

  @test
  grpcModuleJsonDeclaresBuildCommandOnGrpcService() {
    // Sanity check: Task 12 adopted @BuildCommand on GrpcService. If someone
    // removes the decorator the whole dispatch chain silently breaks — catch
    // that regression explicitly.
    assert.ok(existsSync(GRPC_MODULE_JSON), `grpc webda.module.json missing at ${GRPC_MODULE_JSON}`);
    const mod = JSON.parse(readFileSync(GRPC_MODULE_JSON, "utf-8"));
    const entry = mod?.moddas?.["Webda/GrpcService"];
    assert.ok(entry, "Webda/GrpcService missing from moddas");
    assert.ok(entry?.commands?.build, "Webda/GrpcService is missing a build command — did the @BuildCommand decorator get removed?");
  }

  @test
  dispatchesWhenConfigFullyQualifiesGrpcService() {
    const configPath = this.writeConfig({
      GRPCService: { type: "Webda/GrpcService" }
    });
    const mod = JSON.parse(readFileSync(GRPC_MODULE_JSON, "utf-8"));

    const configured = listConfiguredServiceTypes(configPath, "Webda");
    assert.ok(configured.includes("Webda/GrpcService"), `Expected Webda/GrpcService in configured types, got: ${configured.join(", ")}`);

    assert.strictEqual(
      shouldDispatchBuildHooks(mod, configured),
      true,
      "webdac build should dispatch when GrpcService is configured"
    );
  }

  @test
  dispatchesWhenConfigUsesUnqualifiedGrpcServiceAndMatchingNamespace() {
    // Users often drop the namespace when the package namespace matches.
    // listConfiguredServiceTypes prefixes unqualified names with the project
    // namespace — so "GrpcService" in a "Webda"-namespace app should still
    // trigger dispatch.
    const configPath = this.writeConfig({
      GRPCService: { type: "GrpcService" }
    });
    const mod = JSON.parse(readFileSync(GRPC_MODULE_JSON, "utf-8"));

    const configured = listConfiguredServiceTypes(configPath, "Webda");
    assert.deepStrictEqual(configured, ["Webda/GrpcService"]);
    assert.strictEqual(shouldDispatchBuildHooks(mod, configured), true);
  }

  @test
  doesNotDispatchWhenGrpcServiceIsNotConfigured() {
    const configPath = this.writeConfig({
      Store: { type: "Webda/MemoryStore" }
    });
    const mod = JSON.parse(readFileSync(GRPC_MODULE_JSON, "utf-8"));

    const configured = listConfiguredServiceTypes(configPath, "Webda");
    assert.ok(!configured.includes("Webda/GrpcService"));
    assert.strictEqual(
      shouldDispatchBuildHooks(mod, configured),
      false,
      "Dispatch should be skipped when no configured service owns a build hook"
    );
  }

  @test
  doesNotDispatchOnEmptyConfig() {
    const configPath = this.writeConfig({});
    const mod = JSON.parse(readFileSync(GRPC_MODULE_JSON, "utf-8"));

    const configured = listConfiguredServiceTypes(configPath, "Webda");
    assert.deepStrictEqual(configured, []);
    assert.strictEqual(shouldDispatchBuildHooks(mod, configured), false);
  }

  /**
   * Full end-to-end: run the `webda build` binary against the blog-system
   * fixture (which configures Webda/GrpcService) and assert that the proto
   * file lands at the configured path.
   *
   * This is the only test here that spawns a subprocess. It relies on:
   *  - pnpm having linked the `webda` bin into blog-system's node_modules
   *  - blog-system's checked-in webda.module.json being up-to-date enough
   *    for `webda build` to enter the resolved phase
   *
   * If either precondition fails we skip rather than assert-fail, so that
   * a partial workspace install can still run the rest of the grpc tests.
   */
  @test
  webdaBuildOnBlogSystemFixtureProducesProtoFile() {
    if (!existsSync(BLOG_SYSTEM_DIR)) {
      // Fixture not checked out — nothing to exercise.
      return;
    }
    const webdaBin = join(BLOG_SYSTEM_DIR, "node_modules", ".bin", "webda");
    const blogModuleJson = join(BLOG_SYSTEM_DIR, "webda.module.json");
    if (!existsSync(webdaBin) || !existsSync(blogModuleJson)) {
      // Workspace not installed — cannot spawn `webda`. Skip cleanly.
      return;
    }

    const protoPath = join(BLOG_SYSTEM_DIR, ".webda", "app.proto");
    // Remove any prior artifact so we know this run produced the file.
    if (existsSync(protoPath)) {
      rmSync(protoPath);
    }

    try {
      execSync(`"${webdaBin}" build`, {
        cwd: BLOG_SYSTEM_DIR,
        stdio: "pipe",
        timeout: 60_000
      });
    } catch (err: any) {
      // `webda build` is supposed to succeed on the fixture. Surface the
      // stderr to make diagnosis easier when it doesn't.
      const stderr = err?.stderr?.toString?.() ?? "";
      const stdout = err?.stdout?.toString?.() ?? "";
      throw new Error(`webda build failed on blog-system fixture:\n  stdout: ${stdout}\n  stderr: ${stderr}`);
    }

    assert.ok(existsSync(protoPath), `Expected ${protoPath} to be produced by 'webda build'`);
    const proto = readFileSync(protoPath, "utf-8");
    assert.ok(proto.includes('syntax = "proto3"'), "Output should be a proto3 file");
    assert.ok(proto.includes("package webda;"), "Should use the default webda package name");
    // Sanity: blog-system exposes operations over several prefixes (Post, User, Tag, …).
    // At least one service block should appear.
    assert.ok(/service \w+Service \{/.test(proto), "Should declare at least one proto service");
  }
}
