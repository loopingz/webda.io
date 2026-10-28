import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureAuth } from "./auth.js";

const sdk = vi.hoisted(() => ({ token: vi.fn(async () => ({ token: "arm-token", expiresOnTimestamp: Date.now() + 3600000 })) }));
vi.mock("./services/azure-parameters.js", async original => ({ ...await original<typeof import("./services/azure-parameters.js")>(), getAzureCredential: () => ({ getToken: sdk.token }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Azure ARM and ACR authentication", () => {
  it("caches ARM tokens and exchanges them without exposing token values", async () => {
    const auth = new AzureAuth({ tenantId: "tenant" });
    expect(auth.getCredential()).toBe(auth.getCredential());
    expect(await auth.getArmToken()).toBe("arm-token");
    expect(await auth.getArmToken()).toBe("arm-token");
    expect(sdk.token).toHaveBeenCalledTimes(1);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ refresh_token: "refresh-token" })));
    vi.stubGlobal("fetch", fetch);
    expect(await auth.getAcrRefreshToken("test.azurecr.io")).toBe("refresh-token");
    const request = fetch.mock.calls[0];
    expect(request[0]).toBe("https://test.azurecr.io/oauth2/exchange");
    expect(request[1].body.get("tenant")).toBe("tenant");
    expect(request[1].body.get("access_token")).toBe("arm-token");
    for (const host of ["evil.example", "test.azurecr.io@evil.example", "test.azurecr.io/path"]) await expect(auth.getAcrRefreshToken(host)).rejects.toThrow("login server");
  });
  it("reports actionable errors without SDK request or response bodies", async () => {
    sdk.token.mockRejectedValueOnce(new Error("do-not-log-token"));
    await expect(new AzureAuth({}).getArmToken()).rejects.toThrow("run az login");
    sdk.token.mockResolvedValueOnce(null as any);
    await expect(new AzureAuth({}).getArmToken()).rejects.toThrow("run az login");
    const auth = new AzureAuth({});
    const fetch = vi.fn().mockResolvedValueOnce(new Response("secret", { status: 403 })).mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await expect(auth.getAcrRefreshToken("test.azurecr.io")).rejects.toThrow("push permissions");
    await expect(auth.getAcrRefreshToken("test.azurecr.io")).rejects.toThrow("push permissions");
  });
});
