import { afterEach, beforeEach, suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listConfiguredServiceTypes } from "./build-config.js";

@suite
class BuildConfigTest {
  tmp: string;

  @beforeEach
  before() {
    this.tmp = join(tmpdir(), `webda-build-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(this.tmp, { recursive: true });
  }

  @afterEach
  after() {
    rmSync(this.tmp, { recursive: true, force: true });
  }

  @test
  returnsNamespacedTypesVerbatim() {
    const p = join(this.tmp, "webda.config.json");
    writeFileSync(
      p,
      JSON.stringify({
        services: {
          grpc: { type: "Webda/GrpcService" },
          store: { type: "Webda/MemoryStore" }
        }
      })
    );
    assert.deepStrictEqual(listConfiguredServiceTypes(p, "Webda").sort(), ["Webda/GrpcService", "Webda/MemoryStore"]);
  }

  @test
  prefixesUnqualifiedTypes() {
    const p = join(this.tmp, "webda.config.json");
    writeFileSync(
      p,
      JSON.stringify({
        services: {
          grpc: { type: "GrpcService" }
        }
      })
    );
    assert.deepStrictEqual(listConfiguredServiceTypes(p, "MyApp"), ["MyApp/GrpcService"]);
  }

  @test
  returnsEmptyArrayForMissingFile() {
    assert.deepStrictEqual(listConfiguredServiceTypes(join(this.tmp, "nonexistent.json"), "Webda"), []);
  }

  @test
  ignoresServicesWithoutType() {
    const p = join(this.tmp, "webda.config.json");
    writeFileSync(
      p,
      JSON.stringify({
        services: {
          noType: { url: "/foo" },
          withType: { type: "Webda/GrpcService" }
        }
      })
    );
    assert.deepStrictEqual(listConfiguredServiceTypes(p, "Webda"), ["Webda/GrpcService"]);
  }

  @test
  readsJsoncWithComments() {
    const p = join(this.tmp, "webda.config.jsonc");
    writeFileSync(
      p,
      `{
  // gRPC service
  "services": {
    "grpc": { "type": "Webda/GrpcService" } /* main grpc */
  }
}`
    );
    assert.deepStrictEqual(listConfiguredServiceTypes(p, "Webda"), ["Webda/GrpcService"]);
  }

  @test
  deduplicatesSameType() {
    const p = join(this.tmp, "webda.config.json");
    writeFileSync(
      p,
      JSON.stringify({
        services: {
          grpc1: { type: "Webda/GrpcService" },
          grpc2: { type: "Webda/GrpcService" }
        }
      })
    );
    assert.deepStrictEqual(listConfiguredServiceTypes(p, "Webda"), ["Webda/GrpcService"]);
  }

  @test
  returnsEmptyArrayForInvalidJson() {
    const p = join(this.tmp, "bad.json");
    writeFileSync(p, "not-valid-json{{{");
    assert.deepStrictEqual(listConfiguredServiceTypes(p, "Webda"), []);
  }

  @test
  returnsEmptyArrayForMissingServicesKey() {
    const p = join(this.tmp, "webda.config.json");
    writeFileSync(p, JSON.stringify({ parameters: { apiUrl: "http://localhost" } }));
    assert.deepStrictEqual(listConfiguredServiceTypes(p, "Webda"), []);
  }
}
