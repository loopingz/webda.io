import { suite, test } from "@webda/test";
import { CryptoService, SecretString, useDynamicService } from "@webda/core";
import { expect, vi } from "vitest";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { AzureKeyVault, AzureKeyVaultParameters, azureEncrypter } from "./keyvault.service.js";

const sdk = vi.hoisted(() => ({
  getSecret: vi.fn(async (id: string) => ({
    value: id === "config" ? '{"password":"${keyvault:password}"}' : "secret-value"
  })),
  wrap: vi.fn(async (_algorithm, data) => ({
    result: Buffer.from(data),
    keyID: "https://test.vault.azure.net/keys/test/version1"
  })),
  unwrap: vi.fn(async (_algorithm, data) => ({ result: Buffer.from(data) }))
}));
vi.mock("@azure/keyvault-secrets", () => ({
  SecretClient: class {
    getSecret = sdk.getSecret;
  }
}));
vi.mock("@azure/keyvault-keys", () => ({
  CryptographyClient: class {
    wrapKey = sdk.wrap;
    unwrapKey = sdk.unwrap;
  }
}));

@suite
class KeyVaultTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Vault", AzureKeyVault, AzureKeyVaultParameters);
    app.getCurrentConfiguration().services.Vault = {
      type: "Test/Vault",
      vaultUrl: "https://test.vault.azure.net",
      keyId: "https://test.vault.azure.net/keys/test"
    };
  }

  @test async secretsAndConfiguration() {
    const vault = useDynamicService<AzureKeyVault>("Vault");
    expect((await vault.getSecret("password")).getValue()).toBe("secret-value");
    const config = await vault.getConfiguration("config");
    expect(config.password).toBeInstanceOf(SecretString);
    expect(config.password.getValue()).toBe("secret-value");
    expect(JSON.stringify(config)).not.toContain("secret-value");
    expect(vault.canTriggerConfiguration("config", () => {})).toBe(false);
    const resolved = await vault.resolveReferences({ values: ["normal", "${keyvault:password}", null, 2] });
    expect(resolved.values[0]).toBe("normal");
    expect(resolved.values[1]).toBeInstanceOf(SecretString);
    sdk.getSecret.mockResolvedValueOnce({ value: undefined });
    await expect(vault.getSecret("empty")).rejects.toThrow("no value");
    sdk.getSecret.mockRejectedValueOnce({ statusCode: 404 });
    await expect(vault.getSecret("missing")).rejects.toThrow("not found");
    sdk.getSecret.mockRejectedValueOnce(new Error("network"));
    await expect(vault.getSecret("error")).rejects.toThrow("Unable to retrieve");
    for (const value of ["broken-json", "[]", "null", "123"]) {
      sdk.getSecret.mockResolvedValueOnce({ value });
      await expect(vault.getConfiguration("invalid")).rejects.toThrow("JSON object");
    }
    const resources = vault.getAzureResources({
      resources: { subscriptionId: "subscription", resourceGroup: "group", location: "westeurope" }
    } as any);
    expect(resources.roleAssignments).toHaveLength(2);
    expect(resources.roleAssignments![0].scope).toContain("Microsoft.KeyVault/vaults/test");
  }

  @test async envelopeEncryption() {
    const vault = useDynamicService<AzureKeyVault>("Vault");
    const plaintext = "configuration secret 🗝";
    const encrypted = await vault.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    const envelope = JSON.parse(Buffer.from(encrypted, "base64url").toString());
    expect(envelope.keyId.endsWith("/version1")).toBe(true);
    expect((await vault.decrypt(encrypted)).getValue()).toBe(plaintext);
    expect(CryptoService.getEncrypter("azure")?.encrypt).toBeTypeOf("function");
    CryptoService.registerEncrypter("azure", azureEncrypter);
    const configuration = {
      parameters: {
        configurationEncryption: {
          default: "azure",
          encrypters: { azure: { keyId: "https://test.vault.azure.net/keys/test" } }
        }
      },
      secret: "encrypt:azure:cli-secret"
    };
    await CryptoService.encryptConfiguration(configuration);
    expect(configuration.secret).toMatch(/^crypt:azure:/);
    const decrypted = await CryptoService.decryptConfiguration(configuration);
    expect(decrypted.secret.getValue()).toBe("cli-secret");
    azureEncrypter.configure({});
    vi.stubEnv("WEBDA_AZURE_KEY_ID", undefined);
    await expect(azureEncrypter.encrypt("secret")).rejects.toThrow("full Azure");
    vi.unstubAllEnvs();
    expect(
      await azureEncrypter.decrypt(await azureEncrypter.encrypt("", "https://test.vault.azure.net/keys/test"))
    ).toBe("");
    vi.stubEnv("WEBDA_AZURE_KEY_ID", "https://test.vault.azure.net/keys/test");
    try {
      expect(await azureEncrypter.decrypt(await azureEncrypter.encrypt("env"))).toBe("env");
    } finally {
      vi.unstubAllEnvs();
    }
    for (const change of [
      { version: 2 },
      { iv: "bad" },
      { tag: "bad" },
      { ciphertext: "!" },
      { wrappedKey: "" },
      { keyId: "https://attacker.example/keys/test/version" },
      { keyId: "https://test.vault.azure.net/keys/test" },
      { tag: Buffer.alloc(16).toString("base64url") }
    ]) {
      await expect(
        azureEncrypter.decrypt(Buffer.from(JSON.stringify({ ...envelope, ...change })).toString("base64url"))
      ).rejects.toThrow("Unable to decrypt");
    }
    await expect(azureEncrypter.decrypt("invalid")).rejects.toThrow("Unable to decrypt");
    sdk.unwrap.mockResolvedValueOnce({ result: Buffer.alloc(2) });
    await expect(azureEncrypter.decrypt(encrypted)).rejects.toThrow("Unable to decrypt");
    await expect(azureEncrypter.encrypt("secret", "http://invalid")).rejects.toThrow("full Azure");
    sdk.wrap.mockResolvedValueOnce({ result: Buffer.alloc(32), keyID: undefined });
    await expect(vault.encrypt("secret")).rejects.toThrow("versioned");
    sdk.wrap.mockResolvedValueOnce({
      result: Buffer.alloc(32),
      keyID: "https://other.vault.azure.net/keys/test/version"
    });
    await expect(vault.encrypt("secret")).rejects.toThrow("versioned");
  }
}
