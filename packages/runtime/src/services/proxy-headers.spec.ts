import { describe, it } from "vitest";
import * as assert from "assert";
import { EventEmitter } from "events";
import { HttpContext } from "@webda/core";
import { createHttpHeader, ProxyParameters, ProxyService } from "./proxy.service.js";

/**
 * @param proxyHeaders - whether X-Forwarded-* headers are added
 * @returns a proxy service without the full application
 */
function proxy(proxyHeaders: boolean = true, forwardCredentials: boolean = false): ProxyService {
  const service: any = Object.create(ProxyService.prototype);
  service.parameters = { proxyHeaders, forwardCredentials };
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
    assert.strictEqual(headers["x-forwarded-for"], "10.0.0.1");
  });

  it("appends the client ip to an existing X-Forwarded-For", () => {
    const headers = proxy().getRequestHeaders(context({ "X-Forwarded-For": "1.2.3.4, 5.6.7.8" }));
    assert.strictEqual(headers["x-forwarded-for"], "1.2.3.4, 5.6.7.8, 10.0.0.1");
  });

  it("appends the client ip to a repeated X-Forwarded-For", () => {
    const headers = proxy().getRequestHeaders(context({ "x-forwarded-for": ["1.2.3.4", "5.6.7.8"] }));
    assert.strictEqual(headers["x-forwarded-for"], "1.2.3.4, 5.6.7.8, 10.0.0.1");
  });

  it("sets X-Forwarded-Host/Proto/Port from the request when missing", () => {
    let headers = proxy().getRequestHeaders(context());
    assert.strictEqual(headers["x-forwarded-host"], "webda.io");
    assert.strictEqual(headers["x-forwarded-proto"], "https");
    assert.strictEqual(headers["x-forwarded-port"], "443");
    assert.strictEqual(headers["x-rewrite-url"], "/api/test?q=1");
    headers = proxy().getRequestHeaders(context({}, "http", "8080"));
    assert.strictEqual(headers["x-forwarded-host"], "webda.io:8080");
    assert.strictEqual(headers["x-forwarded-proto"], "http");
    assert.strictEqual(headers["x-forwarded-port"], "8080");
  });

  it("keeps X-Forwarded-Host/Proto/Port set by an upstream proxy", () => {
    const headers = proxy().getRequestHeaders(
      context(
        { "X-Forwarded-Host": "public.webda.io", "X-Forwarded-Proto": "https", "X-Forwarded-Port": "8443" },
        "http",
        "8080"
      )
    );
    assert.strictEqual(headers["x-forwarded-host"], "public.webda.io");
    assert.strictEqual(headers["x-forwarded-proto"], "https");
    assert.strictEqual(headers["x-forwarded-port"], "8443");
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
      assert.deepStrictEqual(keysOf(headers, name), [name.toLowerCase()]);
    }
  });

  it("forwards headers untouched when proxyHeaders is disabled", () => {
    const headers = proxy(false).getRequestHeaders(context({ "x-forwarded-for": "1.2.3.4", accept: "text/html" }));
    assert.deepStrictEqual(headers, { "x-forwarded-for": "1.2.3.4", accept: "text/html" });
  });

  it("does not forward the client credentials by default", () => {
    const headers = proxy().getRequestHeaders(
      context({ Authorization: "Bearer secret", Cookie: "webda=session", accept: "text/html" })
    );
    assert.strictEqual(headers["authorization"], undefined);
    assert.strictEqual(headers["cookie"], undefined);
    assert.deepStrictEqual(keysOf(headers, "authorization"), []);
    assert.deepStrictEqual(keysOf(headers, "cookie"), []);
    assert.strictEqual(headers["accept"], "text/html");
    // Also when the X-Forwarded-* headers are disabled
    assert.deepStrictEqual(proxy(false).getRequestHeaders(context({ Authorization: "Bearer secret" })), {});
  });

  it("defaults forwardCredentials to false", () => {
    assert.strictEqual(new ProxyParameters({ backend: "http://backend/" }).forwardCredentials, false);
    assert.strictEqual(
      new ProxyParameters({ backend: "http://backend", forwardCredentials: true }).forwardCredentials,
      true
    );
  });

  it("forwards the client credentials with forwardCredentials", () => {
    const headers = proxy(true, true).getRequestHeaders(
      context({ Authorization: "Bearer secret", Cookie: "webda=session" })
    );
    assert.strictEqual(headers["authorization"], "Bearer secret");
    assert.strictEqual(headers["cookie"], "webda=session");
  });

  it("drops hop-by-hop headers and the ones listed in Connection", () => {
    const headers = proxy(false, true).getRequestHeaders(
      context({
        Connection: "keep-alive, X-Hop",
        "Keep-Alive": "timeout=5",
        "Proxy-Authorization": "Basic cHJveHk=",
        "Proxy-Connection": "keep-alive",
        TE: "trailers",
        Trailer: "Expires",
        Upgrade: "h2c",
        "X-Hop": "1",
        "Transfer-Encoding": "chunked",
        accept: "text/html"
      })
    );
    assert.deepStrictEqual(headers, { "transfer-encoding": "chunked", accept: "text/html" });
    assert.deepStrictEqual(
      proxy(false).getRequestHeaders(context({ connection: ["close", "X-Hop"], "x-hop": "1", accept: "*/*" })),
      { accept: "*/*" }
    );
  });

  it("lets the proxy headers replace client headers of any casing", async () => {
    const service: any = proxy();
    service.log = () => {};
    const metric = { inc: () => {}, dec: () => {} };
    service.metrics = {
      http_request_in_flight: metric,
      http_request_total: metric,
      http_errors: metric
    };
    let sent: any;
    service.createRequest = (_url: string, _method: string, headers: any, callback: (res: any) => void) => {
      sent = headers;
      const res = new EventEmitter();
      callback(Object.assign(res, { statusCode: 200 }));
      res.emit("end");
      return Object.assign(new EventEmitter(), { write: () => true, end: () => {} });
    };
    service.forwardResponse = () => {};
    const http = context({ "X-User": "admin", Host: "webda.io", Authorization: "Bearer secret" });
    http.setBody("");
    await service.rawProxy({ getHttpContext: () => http }, "http://backend:8080", "/test", { "x-user": "alice" });
    assert.strictEqual(sent["x-user"], "alice");
    assert.strictEqual(sent["host"], "backend:8080");
    assert.deepStrictEqual(keysOf(sent, "x-user"), ["x-user"]);
    assert.deepStrictEqual(keysOf(sent, "host"), ["host"]);
    assert.strictEqual(sent["authorization"], undefined);
  });

  it("sets the upgrade headers again for the WebSocket backend", () => {
    const http = context({
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZQ==",
      Cookie: "webda=session"
    });
    const req = proxy().createWSRequest("http://127.0.0.1:1/ws?q=1", <any>{ getHttpContext: () => http });
    req.on("error", () => {});
    const sent = req.getHeaders();
    req.destroy();
    assert.strictEqual(sent["connection"], "Upgrade");
    assert.strictEqual(sent["upgrade"], "websocket");
    assert.strictEqual(sent["sec-websocket-key"], "dGhlIHNhbXBsZQ==");
    assert.strictEqual(sent["host"], "127.0.0.1:1");
    assert.strictEqual(sent["cookie"], undefined);
  });

  it("strips CRLF in createHttpHeader and enforces requireAuthentication in proxyWS", async () => {
    const raw = createHttpHeader("HTTP/1.1 101 OK\r\nInjected: 1", {
      "X-Single\r\n": "val\r\n",
      "X-Multi": ["a\r\n", "b"]
    });
    assert.strictEqual(raw, "HTTP/1.1 101 OKInjected: 1\r\nX-Single: val\r\nX-Multi: a\r\nX-Multi: b\r\n\r\n");
  });
});
