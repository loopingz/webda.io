import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as jose from "jose";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUDIENCE, FakeIdP, OIDCTest } from "../test/fixture.js";
import { OIDCClient } from "./client.service.js";
import { OIDCConfigurationError, OIDCTokenSourceError } from "./errors.js";
import { useOIDCClient, useOIDCIssuer, useOIDCVerifier } from "./hooks.js";
import { GitHubActionsTokenSource } from "./sources/githubactions.js";

@suite
class OIDCClientTest extends OIDCTest {
  idp: FakeIdP;
  dir: string;

  async beforeEach() {
    await super.beforeEach();
    this.idp = await new FakeIdP().addKey("k1");
    this.dir = mkdtempSync(join(tmpdir(), "webda-oidc-"));
  }

  async afterEach() {
    rmSync(this.dir, { recursive: true, force: true });
    await super.afterEach();
  }

  /**
   * @param params - the client parameters
   * @returns a new client
   */
  async client(params: any): Promise<OIDCClient> {
    return this.addService(OIDCClient, params, "OtherClient");
  }

  @test
  async hooks() {
    assert.ok(useOIDCClient() instanceof OIDCClient);
    assert.strictEqual(useOIDCIssuer().getSubject(), "app:orders");
    assert.strictEqual(useOIDCVerifier(), undefined);
  }

  @test
  async selfCacheAndSingleFlight() {
    const client = useOIDCClient();
    client.clearCache();
    const mint = this.stub(useOIDCIssuer(), "mint").callThrough();
    const tokens = await Promise.all([client.getToken(AUDIENCE), client.getToken(AUDIENCE), client.getToken(AUDIENCE)]);
    assert.strictEqual(mint.callCount, 1);
    assert.ok(tokens.every(t => t === tokens[0]));
    assert.strictEqual(await client.getToken(AUDIENCE), tokens[0]);
    assert.strictEqual(mint.callCount, 1);
    // Another audience, another token
    const other = await client.getToken("https://api.internal.example.com");
    assert.strictEqual(jose.decodeJwt(other).aud, "https://api.internal.example.com");
    assert.strictEqual(mint.callCount, 2);
    // Refreshed refreshMargin seconds before the expiration (tokenTtl 300)
    this.stub(Date, "now").returns(Date.now() + 241_000);
    await client.getToken(AUDIENCE);
    assert.strictEqual(mint.callCount, 3);
  }

  @test
  async failureIsNotCached() {
    const client = useOIDCClient();
    client.clearCache();
    const mint = this.stub(useOIDCIssuer(), "mint").rejects(new Error("down"));
    await assert.rejects(() => client.getToken(AUDIENCE), /down/);
    mint.restore();
    assert.ok(await client.getToken(AUDIENCE));
  }

  @test
  async fetchWithBearer() {
    const client = useOIDCClient();
    const requests: { url: string; headers: Headers; init: any }[] = [];
    this.stub(globalThis, "fetch").callsFake(async (url: any, init: any) => {
      requests.push({ url: String(url), headers: new Headers(init.headers), init });
      return new Response("ok");
    });
    await client.fetch(`${AUDIENCE}/invoices?x=1`, { method: "POST", headers: { "X-Test": "1" }, body: "{}" });
    await client.fetch("https://api.internal.example.com/a", { audience: AUDIENCE });
    const [first, second] = requests;
    assert.strictEqual(first.init.method, "POST");
    assert.strictEqual(first.init.audience, undefined);
    assert.strictEqual(first.headers.get("X-Test"), "1");
    const token = first.headers.get("Authorization").substring(7);
    // Default audience: the url origin
    assert.strictEqual(jose.decodeJwt(token).aud, AUDIENCE);
    assert.strictEqual(second.headers.get("Authorization"), `Bearer ${token}`);
  }

  @test
  async fileSource() {
    const file = join(this.dir, "token");
    writeFileSync(file, `${await this.idp.sign({ sub: "system:serviceaccount:prod:orders" })}\n`);
    const client = await this.client({ source: "file", tokenFile: file, refreshMargin: 0 });
    const token = await client.getToken(AUDIENCE);
    assert.strictEqual(jose.decodeJwt(token).sub, "system:serviceaccount:prod:orders");
    // The audience is fixed by the pod spec
    await assert.rejects(() => client.getToken("https://other.example.com"), OIDCConfigurationError);
    // Read again on refresh: the kubelet rotates the file
    writeFileSync(file, await this.idp.sign({ sub: "rotated", aud: [AUDIENCE, "x"] }));
    client.clearCache();
    assert.strictEqual(jose.decodeJwt(await client.getToken(AUDIENCE)).sub, "rotated");
    writeFileSync(file, "garbage");
    client.clearCache();
    await assert.rejects(() => client.getToken(AUDIENCE), OIDCTokenSourceError);
    writeFileSync(file, await this.idp.sign({ exp: undefined }));
    await assert.rejects(() => client.getToken(AUDIENCE), OIDCTokenSourceError);
    rmSync(file);
    await assert.rejects(() => client.getToken(AUDIENCE), OIDCTokenSourceError);
    await assert.rejects(() => this.client({ source: "file" }), OIDCConfigurationError);
  }

  @test
  async gcpMetadataSource() {
    const token = await this.idp.sign();
    const fetch = this.stub(globalThis, "fetch").resolves(new Response(token));
    const client = await this.client({ source: "gcp-metadata" });
    assert.strictEqual(await client.getToken("https://billing.example.com/a b"), token);
    const [url, init] = fetch.firstCall.args as any[];
    assert.strictEqual(
      url,
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Fbilling.example.com%2Fa%20b&format=full"
    );
    assert.strictEqual(init.headers["Metadata-Flavor"], "Google");
    fetch.resolves(new Response("forbidden", { status: 403 }));
    await assert.rejects(() => client.getToken("https://x.example.com"), /HTTP 403/);
    fetch.rejects(new Error("ENOTFOUND"));
    await assert.rejects(() => client.getToken("https://y.example.com"), OIDCTokenSourceError);
  }

  @test
  async githubActionsSource() {
    const token = await this.idp.sign({ sub: "repo:loopingz/orders:ref:refs/heads/main" });
    const fetch = this.stub(globalThis, "fetch").callsFake(async () => Response.json({ value: token }));
    const source = new GitHubActionsTokenSource(1000, {
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/abc?api-version=2.0",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token"
    });
    assert.strictEqual((await source.getToken(AUDIENCE)).token, token);
    const [url, init] = fetch.firstCall.args as any[];
    assert.strictEqual(
      url,
      `https://pipelines.actions.githubusercontent.com/abc?api-version=2.0&audience=${encodeURIComponent(AUDIENCE)}`
    );
    assert.strictEqual(init.headers.Authorization, "Bearer request-token");
    const noQuery = new GitHubActionsTokenSource(1000, {
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://gh.example.com/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "t"
    });
    await noQuery.getToken("aud");
    assert.strictEqual(fetch.secondCall.args[0], "https://gh.example.com/token?audience=aud");
    await assert.rejects(() => new GitHubActionsTokenSource(1000, {}).getToken(AUDIENCE), OIDCConfigurationError);
    // Through the client, from process.env
    const client = await this.client({ source: "github-actions" });
    const env = { ...process.env };
    try {
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://gh.example.com/token";
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = "t";
      assert.strictEqual(await client.getToken(AUDIENCE), token);
    } finally {
      process.env = env;
    }
  }

  @test
  async configuration() {
    await assert.rejects(() => this.client({ source: "unknown" }), OIDCConfigurationError);
    const client = await this.client({ source: "self", issuerService: "MissingIssuer" });
    await assert.rejects(() => client.getToken(AUDIENCE), OIDCConfigurationError);
  }
}
