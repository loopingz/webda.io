import { describe, expect, it } from "vitest";
import { runWithInstanceStorage } from "../core/instancestorage.js";
import {
  listProtectedResources,
  registerProtectedResource,
  resolveProtectedResources,
  unregisterProtectedResource
} from "./protectedresources.js";

describe("protected resources", () => {
  // Each test runs in its own instance storage, so no state leaks between tests
  const isolated = (fn: () => void) => () => runWithInstanceStorage({}, fn);

  it(
    "resolves uri when known, origin + path otherwise",
    isolated(() => {
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
    })
  );

  it(
    "strips long trailing slash sequences",
    isolated(() => {
      registerProtectedResource({ path: "/mcp" });
      expect(resolveProtectedResources("https://app.example" + "/".repeat(100000))).toEqual([
        "https://app.example/mcp"
      ]);
      expect(resolveProtectedResources("/".repeat(100000))).toEqual(["/mcp"]);
    })
  );

  it(
    "replaces on the same path",
    isolated(() => {
      registerProtectedResource({ path: "/mcp" });
      registerProtectedResource({ path: "/mcp", uri: "https://mcp.example/mcp" });
      expect(listProtectedResources()).toEqual([{ path: "/mcp", uri: "https://mcp.example/mcp" }]);
    })
  );

  it(
    "unregisters",
    isolated(() => {
      registerProtectedResource({ path: "/mcp" });
      unregisterProtectedResource("/mcp");
      expect(listProtectedResources()).toEqual([]);
      unregisterProtectedResource("/unknown");
    })
  );

  it(
    "does not share resources between instances",
    isolated(() => {
      registerProtectedResource({ path: "/mcp" });
      runWithInstanceStorage({}, () => expect(listProtectedResources()).toEqual([]));
      expect(listProtectedResources()).toHaveLength(1);
    })
  );
});
