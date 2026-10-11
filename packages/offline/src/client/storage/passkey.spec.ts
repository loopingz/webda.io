import { afterEach, describe, expect, it, vi } from "vitest";
import { PasskeyKeyProvider, PasskeyKeyProviderError } from "./passkey.js";

const PRF = new Uint8Array(32).map((_, i) => i + 1);
const g = globalThis as any;
const saved = {
  navigator: Object.getOwnPropertyDescriptor(g, "navigator"),
  pkc: Object.getOwnPropertyDescriptor(g, "PublicKeyCredential")
};

const setGlobal = (name: string, value: unknown) =>
  Object.defineProperty(g, name, { value, configurable: true, writable: true });
const restore = (name: string, desc?: PropertyDescriptor) =>
  desc ? Object.defineProperty(g, name, desc) : delete g[name];

const stubGet = (results: unknown) => {
  const get = vi.fn(async () => ({ getClientExtensionResults: () => results }));
  setGlobal("navigator", { credentials: { get } });
  return get;
};

afterEach(() => {
  restore("navigator", saved.navigator);
  restore("PublicKeyCredential", saved.pkc);
});

const provider = () => new PasskeyKeyProvider({ credentialId: "AQID_w", label: "test-label" });
const dummy = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

describe("PasskeyKeyProvider", () => {
  it("asks for a PRF evaluation with user verification", async () => {
    const get = stubGet({ prf: { results: { first: PRF } } });
    const p = provider();
    expect(p.id).toBe("passkey:AQID_w");
    await p.unlock();
    const opts = (get.mock.calls[0] as any)[0].publicKey;
    expect(opts.userVerification).toBe("required");
    expect(opts.allowCredentials).toHaveLength(1);
    expect(opts.allowCredentials[0].type).toBe("public-key");
    expect(Array.from(new Uint8Array(opts.allowCredentials[0].id))).toEqual([1, 2, 3, 255]);
    expect(opts.challenge.byteLength).toBe(32);
    expect(Array.from(new Uint8Array(opts.extensions.prf.eval.first))).toEqual(
      Array.from(new TextEncoder().encode("test-label"))
    );
  });

  it("passes rpId and uses a custom challenge", async () => {
    const get = stubGet({ prf: { results: { first: PRF } } });
    await new PasskeyKeyProvider({
      credentialId: "AQID",
      label: "l",
      rpId: "example.com",
      challenge: async () => new Uint8Array([9, 9])
    }).unlock();
    const opts = (get.mock.calls[0] as any)[0].publicKey;
    expect(opts.rpId).toBe("example.com");
    expect(Array.from(new Uint8Array(opts.challenge))).toEqual([9, 9]);
  });

  it("derives a deterministic, non-extractable AES-KW key", async () => {
    stubGet({ prf: { results: { first: PRF } } });
    const k1 = await provider().unlock();
    const k2 = await provider().unlock();
    expect(k1.algorithm.name).toBe("AES-KW");
    expect(k1.extractable).toBe(false);
    expect(k1.usages.sort()).toEqual(["unwrapKey", "wrapKey"]);
    const data = await dummy();
    const wrapped = await crypto.subtle.wrapKey("raw", data, k1, "AES-KW");
    const back = await crypto.subtle.unwrapKey("raw", wrapped, k2, "AES-KW", "AES-GCM", true, ["encrypt"]);
    expect(new Uint8Array(await crypto.subtle.exportKey("raw", back))).toEqual(
      new Uint8Array(await crypto.subtle.exportKey("raw", data))
    );
  });

  it("derives a different key for a different label", async () => {
    stubGet({ prf: { results: { first: PRF } } });
    const k1 = await provider().unlock();
    const k2 = await new PasskeyKeyProvider({ credentialId: "AQID_w", label: "other" }).unlock();
    const wrapped = await crypto.subtle.wrapKey("raw", await dummy(), k1, "AES-KW");
    await expect(crypto.subtle.unwrapKey("raw", wrapped, k2, "AES-KW", "AES-GCM", true, ["encrypt"])).rejects.toThrow();
  });

  it("rejects PRF_UNSUPPORTED when the PRF result is missing", async () => {
    for (const results of [{}, { prf: { enabled: true } }, { prf: { results: {} } }]) {
      stubGet(results);
      await expect(provider().unlock()).rejects.toMatchObject({ code: "PRF_UNSUPPORTED" });
    }
    stubGet({});
    await expect(provider().unlock()).rejects.toBeInstanceOf(PasskeyKeyProviderError);
  });

  it("rejects PRF_UNSUPPORTED without WebAuthn and CANCELLED when no credential is returned", async () => {
    setGlobal("navigator", {});
    await expect(provider().unlock()).rejects.toMatchObject({ code: "PRF_UNSUPPORTED" });
    setGlobal("navigator", { credentials: { get: async () => null } });
    await expect(provider().unlock()).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("isSupported is false without PublicKeyCredential or getClientCapabilities", async () => {
    delete g.PublicKeyCredential;
    expect(await PasskeyKeyProvider.isSupported()).toBe(false);
    setGlobal("PublicKeyCredential", {});
    expect(await PasskeyKeyProvider.isSupported()).toBe(false);
    setGlobal("PublicKeyCredential", {
      getClientCapabilities: async () => {
        throw new Error("boom");
      }
    });
    expect(await PasskeyKeyProvider.isSupported()).toBe(false);
  });

  it("isSupported reflects the extension:prf capability", async () => {
    setGlobal("PublicKeyCredential", { getClientCapabilities: async () => ({ "extension:prf": true }) });
    expect(await PasskeyKeyProvider.isSupported()).toBe(true);
    setGlobal("PublicKeyCredential", { getClientCapabilities: async () => ({}) });
    expect(await PasskeyKeyProvider.isSupported()).toBe(false);
  });

  it("prfRegistrationExtension requests PRF", () => {
    expect(PasskeyKeyProvider.prfRegistrationExtension("l")).toEqual({ prf: {} });
  });
});
