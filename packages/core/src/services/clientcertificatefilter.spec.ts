import { suite, test } from "@webda/test";
import * as assert from "assert";
import { ClientCertificateFilter, ClientCertificateFilterParameters } from "./clientcertificatefilter.service.js";
import { HttpContext } from "../contexts/httpcontext.js";

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
