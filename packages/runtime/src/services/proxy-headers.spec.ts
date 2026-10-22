import { describe, it } from "vitest";
import * as assert from "assert";
import { HttpContext } from "@webda/core";
import { ProxyService } from "./proxy.service.js";

/**
 * @param proxyHeaders - whether X-Forwarded-* headers are added
 * @returns a proxy service without the full application
 */
function proxy(proxyHeaders: boolean = true): ProxyService {
  const service: any = Object.create(ProxyService.prototype);
  service.parameters = { proxyHeaders };
  return service;
}

/**
 * @param headers - incoming request headers
 * @param protocol - incoming protocol
 * @param port - incoming port
 * @returns an http context coming from 10.0.0.1
 */
function context(
  headers: { [key: string]: string | string[] } = {},
  protocol: "http" | "https" = "https",
  port: string = "443"
): HttpContext {
  return new HttpContext("webda.io", "GET", "/api/test?q=1", protocol, port, headers).setClientIp("10.0.0.1");
}

/**
 * @param headers - the computed headers
 * @param name - header name, case-insensitive
 * @returns every header key matching the name
 */
function keysOf(headers: object, name: string): string[] {
  return Object.keys(headers).filter(k => k.toLowerCase() === name.toLowerCase());
}

describe("ProxyService.getRequestHeaders", () => {
  it("sets X-Forwarded-For to the client ip when missing", () => {
    const headers = proxy().getRequestHeaders(context());
    assert.strictEqual(headers["X-Forwarded-For"], "10.0.0.1");
  });

  it("appends the client ip to an existing X-Forwarded-For", () => {
    const headers = proxy().getRequestHeaders(context({ "X-Forwarded-For": "1.2.3.4, 5.6.7.8" }));
    assert.strictEqual(headers["X-Forwarded-For"], "1.2.3.4, 5.6.7.8, 10.0.0.1");
  });

  it("appends the client ip to a repeated X-Forwarded-For", () => {
    const headers = proxy().getRequestHeaders(context({ "x-forwarded-for": ["1.2.3.4", "5.6.7.8"] }));
    assert.strictEqual(headers["X-Forwarded-For"], "1.2.3.4, 5.6.7.8, 10.0.0.1");
  });

  it("sets X-Forwarded-Host/Proto/Port from the request when missing", () => {
    let headers = proxy().getRequestHeaders(context());
    assert.strictEqual(headers["X-Forwarded-Host"], "webda.io");
    assert.strictEqual(headers["X-Forwarded-Proto"], "https");
    assert.strictEqual(headers["X-Forwarded-Port"], "443");
    assert.strictEqual(headers["X-Rewrite-URL"], "/api/test?q=1");
    headers = proxy().getRequestHeaders(context({}, "http", "8080"));
    assert.strictEqual(headers["X-Forwarded-Host"], "webda.io:8080");
    assert.strictEqual(headers["X-Forwarded-Proto"], "http");
    assert.strictEqual(headers["X-Forwarded-Port"], "8080");
  });

  it("keeps X-Forwarded-Host/Proto/Port set by an upstream proxy", () => {
    const headers = proxy().getRequestHeaders(
      context(
        { "X-Forwarded-Host": "public.webda.io", "X-Forwarded-Proto": "https", "X-Forwarded-Port": "8443" },
        "http",
        "8080"
      )
    );
    assert.strictEqual(headers["X-Forwarded-Host"], "public.webda.io");
    assert.strictEqual(headers["X-Forwarded-Proto"], "https");
    assert.strictEqual(headers["X-Forwarded-Port"], "8443");
  });

  it("does not forward duplicate X-Forwarded-* headers with different casing", () => {
    const headers = proxy().getRequestHeaders(
      context({
        "X-Forwarded-For": "1.2.3.4",
        "X-Forwarded-Host": "public.webda.io",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Port": "443"
      })
    );
    for (const name of ["X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Forwarded-Port"]) {
      assert.deepStrictEqual(keysOf(headers, name), [name]);
    }
  });

  it("forwards headers untouched when proxyHeaders is disabled", () => {
    const headers = proxy(false).getRequestHeaders(context({ "x-forwarded-for": "1.2.3.4", accept: "text/html" }));
    assert.deepStrictEqual(headers, { "x-forwarded-for": "1.2.3.4", accept: "text/html" });
  });
});
