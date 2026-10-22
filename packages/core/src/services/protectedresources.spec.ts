import { afterEach, describe, expect, it } from "vitest";
import {
  listProtectedResources,
  registerProtectedResource,
  resolveProtectedResources,
  unregisterProtectedResource
} from "./protectedresources.js";

describe("protected resources", () => {
  afterEach(() => {
    for (const { path } of listProtectedResources()) {
      unregisterProtectedResource(path);
    }
  });

  it("resolves uri when known, origin + path otherwise", () => {
    registerProtectedResource({ path: "/mcp", uri: "https://mcp.example/mcp" });
    registerProtectedResource({ path: "/api/mcp" });
    expect(resolveProtectedResources("https://app.example")).toEqual([
      "https://mcp.example/mcp",
      "https://app.example/api/mcp"
    ]);
    expect(resolveProtectedResources("https://app.example/")).toEqual([
      "https://mcp.example/mcp",
      "https://app.example/api/mcp"
    ]);
  });

  it("replaces on the same path", () => {
    registerProtectedResource({ path: "/mcp" });
    registerProtectedResource({ path: "/mcp", uri: "https://mcp.example/mcp" });
    expect(listProtectedResources()).toEqual([{ path: "/mcp", uri: "https://mcp.example/mcp" }]);
  });

  it("unregisters", () => {
    registerProtectedResource({ path: "/mcp" });
    unregisterProtectedResource("/mcp");
    expect(listProtectedResources()).toEqual([]);
    unregisterProtectedResource("/unknown");
  });
});
