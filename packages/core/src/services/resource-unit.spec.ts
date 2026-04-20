import { suite, test } from "@webda/test";
import * as assert from "assert";
import { getMetadata } from "@webda/decorators";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { ResourceServiceParameters } from "./resource.js";

/**
 * Unit coverage for the @Route decorators and parameter loading on
 * ResourceService. The full integration spec still needs a refactor before
 * it can run under @webda/test.
 */
@suite
class ResourceUnitTest {
  @test
  parametersNormalizeTrailingSlashAndDefaults() {
    const params = new ResourceServiceParameters({ url: "/assets" });
    assert.strictEqual(params.url, "/assets/");
    assert.strictEqual(params.folder, "./assets/");
    assert.strictEqual(params.index, "index.html");
    assert.strictEqual(params.indexFallback, true);
    assert.strictEqual(params.allowHiddenFiles, false);
  }

  @test
  async serveRoutesAreRegisteredViaDecorator() {
    // Import triggers the decorators on _serve
    const mod = await import("./resource.js");
    const routes: Record<string, any[]> =
      getMetadata(mod.ResourceService as any)?.["webda.route"] || {};
    assert.ok(routes["."], "Expected @Route(\".\") on _serve");
    assert.ok(routes["./{+resource}"], "Expected @Route(\"./{+resource}\") on _serve");
    assert.strictEqual(routes["."][0].openapi.get.operationId, "getResource");
    assert.strictEqual(routes["./{+resource}"][0].openapi.get.operationId, "getResources");
  }

  @test
  async initRegistersRootRedirectRouteOnlyWhenEnabled() {
    const mod = await import("./resource.js");
    const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "webda-resource-"));
    try {
      // Without rootRedirect → init adds no programmatic routes
      const noRedirectAdds: string[] = [];
      const noRedirectSvc: any = new (mod.ResourceService as any)(
        "ResourceA",
        new ResourceServiceParameters({ url: "/a", folder: tmpDir, rootRedirect: false })
      );
      noRedirectSvc.addRoute = (url: string) => noRedirectAdds.push(url);
      noRedirectSvc.resolve();
      await noRedirectSvc.init();
      assert.deepStrictEqual(noRedirectAdds, []);

      // With rootRedirect → init adds the "/" route
      const redirectAdds: string[] = [];
      const redirectSvc: any = new (mod.ResourceService as any)(
        "ResourceB",
        new ResourceServiceParameters({ url: "/b", folder: tmpDir, rootRedirect: true })
      );
      redirectSvc.addRoute = (url: string) => redirectAdds.push(url);
      redirectSvc.resolve();
      await redirectSvc.init();
      assert.deepStrictEqual(redirectAdds, ["/"]);
    } finally {
      nodeFs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  @test
  async redirectHandlerSetsCacheControlAndLocation() {
    const mod = await import("./resource.js");
    const svc: any = new (mod.ResourceService as any)(
      "ResourceRedirect",
      new ResourceServiceParameters({ url: "/r", folder: nodeOs.tmpdir(), rootRedirect: true })
    );
    const headers: Record<string, string> = {};
    const ctx: any = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      redirect: (url: string) => { headers["Location"] = url; },
      getHttpContext: () => ({ getAbsoluteUrl: (suffix: string) => `http://host${suffix}` })
    };
    svc._redirect(ctx);
    assert.strictEqual(headers["cache-control"], svc.getParameters().cacheControl);
    assert.strictEqual(headers["Location"], "http://host/r/");
  }
}

export { ResourceUnitTest };
