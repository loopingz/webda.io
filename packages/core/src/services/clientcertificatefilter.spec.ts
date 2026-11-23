import { suite, test } from "@webda/test";
import * as assert from "assert";
import { ClientCertificateFilter, ClientCertificateFilterParameters } from "./clientcertificatefilter.service.js";
import { HttpContext } from "../contexts/httpcontext.js";
import { WebdaInternalSimpleTest } from "../test/index.js";
import type { UnpackedConfiguration } from "../application/iconfiguration.js";
import { useService } from "../core/hooks.js";
import { useRouter } from "../rest/hooks.js";

/**
 * @param path - request uri
 * @param verified - certificate verification, undefined for no certificate
 * @returns a context presenting that request
 */
function context(path: string, verified?: boolean): any {
  const http = new HttpContext("api.example.com", "GET", path);
  if (verified !== undefined) {
    http.setClientCertificate({ subject: { CN: "alice" }, verified } as any);
  }
  return { getHttpContext: () => http };
}

@suite
class ClientCertificateFilterTest {
  @test
  async allPaths() {
    const filter = new ClientCertificateFilter("filter", new ClientCertificateFilterParameters().load({}));
    assert.strictEqual(await filter.checkRequest(context("/any", true)), true);
    assert.strictEqual(await filter.checkRequest(context("/any", false)), false);
    assert.strictEqual(await filter.checkRequest(context("/any")), false);
  }

  @test
  async restrictedPaths() {
    const filter = new ClientCertificateFilter(
      "filter",
      new ClientCertificateFilterParameters().load({ paths: ["^/internal/", "^/metrics$"] })
    );
    filter.resolve();
    assert.strictEqual(await filter.checkRequest(context("/internal/jobs?x=1", true)), true);
    assert.strictEqual(await filter.checkRequest(context("/metrics?format=text", true)), true);
    assert.strictEqual(await filter.checkRequest(context("/public", true)), false);
    assert.strictEqual(await filter.checkRequest(context("/internal/jobs", false)), false);
    // A single string is accepted
    const single = new ClientCertificateFilter(
      "single",
      new ClientCertificateFilterParameters().load({ paths: "^/admin" } as any)
    );
    assert.strictEqual(await single.checkRequest(context("/admin/users", true)), true);
    assert.strictEqual(await single.checkRequest(context("/users", true)), false);
  }
}

/**
 * A filter declared with its short type ("ClientCertificateFilter" rather than
 * "Webda/ClientCertificateFilter") must still have its capabilities, so the
 * router registers it as a request filter
 */
@suite
class ClientCertificateFilterShortTypeTest extends WebdaInternalSimpleTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: { ignoreBeans: true },
      services: {
        shortFilter: { type: "ClientCertificateFilter" }
      }
    };
  }

  @test
  async shortTypeIsARequestFilter() {
    const filter = useService("shortFilter" as any) as ClientCertificateFilter;
    assert.ok(filter instanceof ClientCertificateFilter);
    assert.ok("request-filter" in filter.getCapabilities());
    const ctx = await this.newContext();
    ctx.setHttpContext(new HttpContext("api.example.com", "GET", "/any"));
    // No client certificate: the filter refuses the request
    assert.strictEqual(await useRouter().checkRequest(ctx), false);
    ctx.getHttpContext().setClientCertificate({ subject: { CN: "alice" }, verified: true } as any);
    assert.strictEqual(await useRouter().checkRequest(ctx), true);
  }
}
