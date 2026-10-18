import { useService, WebContext } from "@webda/core";
import { suite, test } from "@webda/test";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import * as assert from "assert";
import * as jose from "jose";
import { AUDIENCE, FakeIdP, ISSUER, OIDCTest } from "../test/fixture.js";
import { OIDCConfigurationError, OIDCTokenInvalid } from "./errors.js";
import { OIDCVerifier } from "./verifier.service.js";

@suite
class OIDCVerifierTest extends OIDCTest {
  idp: FakeIdP;
  fetch: any;
  verifier: OIDCVerifier;

  async beforeEach() {
    await super.beforeEach();
    this.idp = await new FakeIdP().addKey("k1");
    this.fetch = this.stub(globalThis, "fetch").callsFake(this.idp.fetch);
    this.verifier = await this.addVerifier({
      trustedIssuers: [{ issuer: ISSUER, claims: { sub: "app:*" } }]
    });
  }

  async afterEach() {
    await this.verifier?.stop();
    await super.afterEach();
  }

  /**
   * Load the session of a request with a Bearer token
   * @param token - the token
   * @returns the session
   */
  async load(token: string) {
    const ctx = await this.newContext<WebContext>();
    ctx.getHttpContext().headers["authorization"] = `Bearer ${token}`;
    return useService("SessionManager").load(ctx);
  }

  @test
  async validToken() {
    const identity = await this.verifier.verify(await this.idp.sign({ team: "core" }));
    assert.strictEqual(identity.issuer, ISSUER);
    assert.strictEqual(identity.subject, "app:orders");
    // The app: prefix of a Webda issuer is not repeated
    assert.strictEqual(identity.principal, "orders");
    assert.strictEqual(identity.claims.team, "core");
    assert.ok(identity.expiresAt > Date.now());
    // Discovery, then JWKS
    assert.deepStrictEqual(this.idp.calls, [`${ISSUER}/.well-known/openid-configuration`, `${ISSUER}/jwks`]);
    // Cached
    await this.verifier.verify(await this.idp.sign());
    assert.strictEqual(this.idp.calls.length, 2);
  }

  @test
  async bearerGivesApplicationSession() {
    const session = await this.load(await this.idp.sign());
    assert.ok(session.isApplication());
    assert.ok(session.stateless);
    assert.strictEqual(session.userId, undefined);
    assert.deepStrictEqual(session.amr, ["oidc"]);
    assert.strictEqual(session.provider, ISSUER);
    assert.strictEqual(session.application.principal, "orders");
    // Access tokens of the TokenService behave as before
    const user = new (session.constructor as any)();
    user.login("u1", "a@b.c:email");
    const access = (await useService("TokenService").issue(user)).accessToken;
    const loaded = await this.load(access);
    assert.strictEqual(loaded.userId, "u1");
    assert.ok(!loaded.isApplication());
  }

  @test
  async unknownIssuerNeverFetched() {
    const evil = await new FakeIdP("https://evil.example.com").addKey("k1");
    assert.strictEqual(await this.verifier.verify(await evil.sign()), undefined);
    assert.ok(!(await this.load(await evil.sign())).isApplication());
    // Not a JWT either
    assert.strictEqual(await this.verifier.verify("not-a-jwt"), undefined);
    assert.strictEqual(this.fetch.callCount, 0);
  }

  @test
  async algorithmConfusion() {
    // Warm the key set so the kid exists
    assert.ok(await this.verifier.verify(await this.idp.sign()));
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: ISSUER, aud: AUDIENCE, sub: "app:orders", iat: now, exp: now + 60 };
    // alg: none
    const none = new jose.UnsecuredJWT(claims).encode();
    const [, payload] = none.split(".");
    const noneWithKid = `${Buffer.from(JSON.stringify({ alg: "none", kid: "k1" })).toString("base64url")}.${payload}.`;
    assert.strictEqual(await this.verifier.verify(none), undefined);
    assert.strictEqual(await this.verifier.verify(noneWithKid), undefined);
    // HS256 signed with the public key material, with a matching kid
    const secret = new TextEncoder().encode(JSON.stringify(this.idp.keys.get("k1").jwk));
    const hs = await new jose.SignJWT(claims).setProtectedHeader({ alg: "HS256", kid: "k1" }).sign(secret);
    assert.strictEqual(await this.verifier.verify(hs), undefined);
    assert.ok(!(await this.load(hs)).isApplication());
    // Symmetric algorithms cannot be configured
    for (const algorithms of [["HS256"], ["none"], ["RS256", "hs512"], []]) {
      await assert.rejects(
        () => this.addVerifier({ trustedIssuers: [{ issuer: ISSUER, algorithms }] }),
        OIDCConfigurationError,
        JSON.stringify(algorithms)
      );
    }
  }

  @test
  async algorithmAllowList() {
    await this.idp.addKey("ps", "PS256");
    assert.strictEqual(await this.verifier.verify(await this.idp.sign({}, { kid: "ps" })), undefined);
    const verifier = await this.addVerifier({ trustedIssuers: [{ issuer: ISSUER, algorithms: ["PS256"] }] });
    assert.ok(await verifier.verify(await this.idp.sign({}, { kid: "ps" })));
    assert.strictEqual(await verifier.verify(await this.idp.sign({}, { kid: "k1" })), undefined);
    await verifier.stop();
  }

  @test
  async discoveryIssuerMismatch() {
    this.idp.discovery = { issuer: "https://other.example.com", jwks_uri: `${ISSUER}/jwks` };
    assert.strictEqual(await this.verifier.verify(await this.idp.sign()), undefined);
    assert.strictEqual(this.idp.jwksCalls(), 0);
    this.idp.discovery = { issuer: ISSUER, jwks_uri: "http://issuer.example.com/jwks" };
    assert.strictEqual(await this.verifier.verify(await this.idp.sign()), undefined, "jwks_uri must be https");
    assert.strictEqual(this.idp.jwksCalls(), 0);
  }

  @test
  async discoveryFailureKeepsPreviousKeys() {
    assert.ok(await this.verifier.verify(await this.idp.sign()));
    const state = (this.verifier as any).issuers.get(ISSUER);
    state.discoveredAt = 0;
    this.idp.discovery = { issuer: "https://other.example.com" };
    assert.ok(await this.verifier.verify(await this.idp.sign()));
    // Retried later, not on every request
    const calls = this.idp.calls.length;
    assert.ok(await this.verifier.verify(await this.idp.sign()));
    assert.strictEqual(this.idp.calls.length, calls);
  }

  @test
  async claimValidation() {
    const now = Math.floor(Date.now() / 1000);
    const refused = {
      "wrong audience": { aud: "https://other.example.com" },
      expired: { iat: now - 400, nbf: now - 400, exp: now - 100 },
      "nbf in the future": { nbf: now + 120 },
      "lifetime above maxTokenAge": { exp: now + 7200 },
      "no iat": { iat: undefined },
      "no exp": { exp: undefined },
      "claim rule": { sub: "user:123" }
    };
    for (const [name, claims] of Object.entries(refused)) {
      const token = await this.idp.sign(claims);
      assert.strictEqual(await this.verifier.verify(token), undefined, name);
      assert.ok(!(await this.load(token)).isApplication(), name);
    }
    // Within the clock tolerance
    assert.ok(await this.verifier.verify(await this.idp.sign({ nbf: now + 10 })));
  }

  @test
  async unknownKidRefetchIsRateLimited() {
    const unknown = await new FakeIdP().addKey("k2");
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(await this.verifier.verify(await unknown.sign()), undefined);
    }
    // One JWKS fetch: the unknown kid does not refetch within the cooldown
    assert.strictEqual(this.idp.jwksCalls(), 1);
    // After the cooldown, a rotated key is fetched once
    await this.idp.addKey("k3");
    const token = await this.idp.sign({}, { kid: "k3" });
    // jose cooldown reads Date.now, the claims checks use new Date()
    this.stub(Date, "now").returns(Date.now() + 31_000);
    assert.ok(await this.verifier.verify(token));
    assert.strictEqual(this.idp.jwksCalls(), 2);
  }

  @test
  async githubActionsRules() {
    const gha = await new FakeIdP("https://token.actions.githubusercontent.com").addKey("gh");
    this.fetch.callsFake(gha.fetch);
    const verifier = await this.addVerifier({
      trustedIssuers: [
        {
          issuer: "https://token.actions.githubusercontent.com",
          claims: { repository: "loopingz/*", ref: ["refs/heads/main", "refs/tags/*"] },
          principal: "gha:${repository}",
          groups: ["ci"]
        }
      ]
    });
    const claims = { sub: "repo:loopingz/orders:ref:refs/heads/main", repository: "loopingz/orders" };
    const identity = await verifier.verify(await gha.sign({ ...claims, ref: "refs/heads/main" }));
    assert.strictEqual(identity.principal, "gha:loopingz/orders");
    assert.deepStrictEqual(identity.groups, ["ci"]);
    assert.ok(await verifier.verify(await gha.sign({ ...claims, ref: "refs/tags/v1" })));
    assert.strictEqual(await verifier.verify(await gha.sign({ ...claims, ref: "refs/heads/dev" })), undefined);
    assert.strictEqual(await verifier.verify(await gha.sign({ ...claims, ref: undefined })), undefined);
    assert.strictEqual(
      await verifier.verify(await gha.sign({ ...claims, repository: "evil/orders", ref: "refs/heads/main" })),
      undefined
    );
    await verifier.stop();
  }

  @test
  async principalTemplate() {
    const verifier = await this.addVerifier({
      trustedIssuers: [{ issuer: ISSUER, principal: "k8s:${kubernetes.io}:${sub}" }]
    });
    const identity = await verifier.verify(
      await this.idp.sign({ sub: "system:serviceaccount:prod:orders", "kubernetes.io": "a b$c" })
    );
    // Sanitized
    assert.strictEqual(identity.principal, "k8s:a_b_c:system:serviceaccount:prod:orders");
    // Missing claim
    assert.strictEqual(await verifier.verify(await this.idp.sign({ "kubernetes.io": undefined })), undefined);
    await verifier.stop();
  }

  @test
  async jwksUriOverride() {
    const verifier = await this.addVerifier({
      trustedIssuers: [{ issuer: ISSUER, jwksUri: `${ISSUER}/jwks`, audiences: ["urn:billing"], maxTokenAge: 60 }]
    });
    assert.ok(
      await verifier.verify(await this.idp.sign({ aud: "urn:billing", exp: Math.floor(Date.now() / 1000) + 60 }))
    );
    assert.strictEqual(await verifier.verify(await this.idp.sign({ aud: "urn:billing" })), undefined, "maxTokenAge");
    assert.strictEqual(await verifier.verify(await this.idp.sign()), undefined, "default audience replaced");
    assert.deepStrictEqual(this.idp.calls, [`${ISSUER}/jwks`]);
    await verifier.stop();
  }

  @test
  async configuration() {
    const invalid = [
      [{ issuer: "" }],
      [{ issuer: "http://issuer.example.com" }],
      [{ issuer: "not a url" }],
      [{ issuer: ISSUER }, { issuer: ISSUER }],
      [{ issuer: ISSUER, jwksUri: "http://issuer.example.com/jwks" }]
    ];
    for (const trustedIssuers of invalid) {
      await assert.rejects(() => this.addVerifier({ trustedIssuers }), OIDCConfigurationError);
    }
    await assert.rejects(
      () => this.addVerifier({ audience: undefined, trustedIssuers: [{ issuer: ISSUER }] }),
      OIDCConfigurationError
    );
    // A non-URL issuer is fine with an explicit jwksUri, http on loopback too
    const verifier = await this.addVerifier({
      trustedIssuers: [
        { issuer: "kubernetes/serviceaccount", jwksUri: "https://k8s.example.com/openid/v1/jwks" },
        { issuer: "http://localhost:8080" }
      ]
    });
    await verifier.stop();
  }

  @test
  async verifyOrFail() {
    assert.ok(await this.verifier.verifyOrFail(await this.idp.sign()));
    await assert.rejects(() => this.verifier.verifyOrFail("nope"), OIDCTokenInvalid);
    await assert.rejects(
      () => this.verifier.verifyOrFail("nope"),
      (err: OIDCTokenInvalid) => err.getResponseCode() === 401
    );
  }

  @test
  async tokensNeverLogged() {
    const logger = new MemoryLogger(useWorkerOutput(), "TRACE");
    const evil = await new FakeIdP("https://evil.example.com").addKey("k1");
    const tokens = [
      await this.idp.sign(),
      await this.idp.sign({ aud: "https://other.example.com" }),
      await this.idp.sign({ sub: "user:1" }),
      await evil.sign(),
      "not-a-jwt-secret-value"
    ];
    try {
      for (const token of tokens) {
        await this.verifier.verify(token);
        await this.load(token);
      }
      const logs = JSON.stringify(logger.getLogs());
      assert.ok(logs.includes("refused an OIDC token"), "refusals are logged");
      for (const token of tokens) {
        assert.ok(!logs.includes(token), "token found in the logs");
        // Not even the signature
        const signature = token.split(".")[2];
        if (signature) {
          assert.ok(!logs.includes(signature), "signature found in the logs");
        }
      }
    } finally {
      logger.close();
    }
  }

  @test
  async stoppedOrReplacedVerifierDoesNotResolve() {
    const token = await this.idp.sign();
    await this.verifier.stop();
    assert.ok(!(await this.load(token)).isApplication());
    // Replaced by another instance: the previous one stays out
    const replacement = await this.addVerifier({ trustedIssuers: [{ issuer: ISSUER }] });
    const previous = await this.addVerifier({ trustedIssuers: [{ issuer: ISSUER }] });
    this.registerService(replacement, "OIDCVerifier");
    assert.strictEqual(await previous.resolveBearer(token, undefined), undefined);
    assert.ok(await replacement.resolveBearer(token, undefined));
    await replacement.stop();
  }
}
