import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientSecretCredential, DefaultAzureCredential } from "@azure/identity";
import { SecretString } from "@webda/core";
import { useLog } from "@webda/workout";
import { getAzureCredential, loadAzureParameters } from "../index.js";

vi.mock("@azure/identity", () => ({
  ClientSecretCredential: vi.fn(
    class {
      getToken = vi.fn();
    }
  ),
  DefaultAzureCredential: vi.fn(
    class {
      getToken = vi.fn();
    }
  )
}));
vi.mock("@webda/workout", async importOriginal => ({
  ...(await importOriginal<typeof import("@webda/workout")>()),
  useLog: vi.fn()
}));

const azureEnvironment = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_SUBSCRIPTION_ID"];

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of azureEnvironment) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Azure credentials", () => {
  it("uses a complete service principal and unwraps SecretString only for the SDK", () => {
    const secret = new SecretString("encrypted-value", "test");
    const params = Object.freeze({ tenantId: "tenant", clientId: "client", clientSecret: secret });
    const credential = getAzureCredential(params);
    expect(credential).toBeInstanceOf(ClientSecretCredential);
    expect(ClientSecretCredential).toHaveBeenCalledWith("tenant", "client", "encrypted-value");
    expect(DefaultAzureCredential).not.toHaveBeenCalled();
    expect(params.clientSecret).toBe(secret);
    expect(JSON.stringify(params)).not.toContain("encrypted-value");
    expect(useLog).not.toHaveBeenCalled();
    expect(credential.getToken).not.toHaveBeenCalled();
  });

  it("warns on clear-text secrets without logging their values", () => {
    getAzureCredential({ tenantId: "tenant", clientId: "client", clientSecret: "do-not-log-this" });
    expect(ClientSecretCredential).toHaveBeenCalledWith("tenant", "client", "do-not-log-this");
    expect(useLog).toHaveBeenCalledWith("WARN", expect.stringContaining("clientSecret"));
    expect(JSON.stringify(vi.mocked(useLog).mock.calls)).not.toContain("do-not-log-this");
  });

  it("uses standard environment fallbacks including the subscription", () => {
    vi.stubEnv("AZURE_TENANT_ID", "env-tenant");
    vi.stubEnv("AZURE_CLIENT_ID", "env-client");
    vi.stubEnv("AZURE_CLIENT_SECRET", "env-secret");
    vi.stubEnv("AZURE_SUBSCRIPTION_ID", "env-subscription");
    const input = Object.freeze({ endpoint: "http://localhost:10000" });
    const credential = getAzureCredential(input);
    expect(credential).toBeInstanceOf(ClientSecretCredential);
    expect(ClientSecretCredential).toHaveBeenCalledWith("env-tenant", "env-client", "env-secret");
    expect(input).toEqual({ endpoint: "http://localhost:10000" });
    const loaded = loadAzureParameters({});
    expect(loaded).toEqual({
      tenantId: "env-tenant",
      clientId: "env-client",
      clientSecret: "env-secret",
      subscriptionId: "env-subscription"
    });
  });

  it("preserves explicitly configured values and fills only absent fields", () => {
    for (const name of azureEnvironment) vi.stubEnv(name, "environment");
    const params = {
      tenantId: "tenant",
      clientId: "client",
      clientSecret: new SecretString("secret", "test"),
      subscriptionId: "subscription",
      endpoint: "http://azurite:10000"
    };
    const copy = { ...params };
    expect(loadAzureParameters(params)).toBe(params);
    expect(params).toEqual(copy);
    getAzureCredential(params);
    expect(ClientSecretCredential).toHaveBeenCalledWith("tenant", "client", "secret");
    expect(process.env.AZURE_CLIENT_ID).toBe("environment");
  });

  it.each([
    {},
    { tenantId: "tenant" },
    { clientId: "client" },
    { clientSecret: new SecretString("secret", "test") },
    { tenantId: "tenant", clientId: "client" },
    { tenantId: "tenant", clientSecret: new SecretString("secret", "test") },
    { clientId: "client", clientSecret: new SecretString("secret", "test") },
    { tenantId: "tenant", clientId: "client", clientSecret: "" }
  ])("uses the default chain for incomplete credentials (%#)", params => {
    const credential = getAzureCredential(params);
    expect(credential).toBeInstanceOf(DefaultAzureCredential);
    expect(ClientSecretCredential).not.toHaveBeenCalled();
    expect(DefaultAzureCredential).toHaveBeenCalledWith({
      tenantId: params.tenantId,
      managedIdentityClientId: params.clientId,
      workloadIdentityClientId: params.clientId
    });
    expect(credential.getToken).not.toHaveBeenCalled();
  });

  it("accepts no parameters and preserves explicit empty values in parameter loading", () => {
    expect(getAzureCredential()).toBeInstanceOf(DefaultAzureCredential);
    vi.stubEnv("AZURE_CLIENT_ID", "from-env");
    expect(loadAzureParameters({ clientId: "" }).clientId).toBe("");
  });
});
