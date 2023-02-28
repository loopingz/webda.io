import { suite, test } from "@testdeck/mocha";
import { OAuthSession } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import fetch from "node-fetch";
import { GoogleAuthentication } from "./google-auth";
@suite
class GoogleAuthTest extends WebdaTest {
  service: GoogleAuthentication;

  async before() {
    await super.before();
    this.service = new GoogleAuthentication(this.webda, "google", {
      client_id: "fake",
      client_secret: "secret",
    });
  }

  @test
  cov() {
    assert.strictEqual(this.service.getName(), "google");
    assert.strictEqual(this.service.getDefaultUrl(), "/google");
    assert.deepStrictEqual(this.service.getCallbackReferer(), [
      /accounts\.google\.[a-z]+$/,
    ]);
    assert.strictEqual(this.service.hasToken(), true);
  }

  @test
  generateAuthUrl() {
    let url = this.service.generateAuthUrl("plopor", "myState", undefined);
    assert.strictEqual(
      url,
      "https://accounts.google.com/o/oauth2/v2/auth?access_type=online&scope=email&redirect_uri=plopor&response_type=code&state=myState&client_id=fake"
    );
  }

  mockClient() {
    // Mock client
    // @ts-ignore
    this.service.getOAuthClient = () => {
      return {
        getToken: async (arg) => {
          if (arg === "u1") return { tokens: { id_token: arg } };
        },
        generateAuthUrl: () => {
          return "/";
        },
        setCredentials: () => {},
        verifyIdToken: async (args) => {
          if (args.idToken === "u1") {
            return {
              getPayload: () => {
                return {
                  sub: "u1",
                  email: "u1@webda.io",
                };
              },
            };
          }
        },
      };
    };
  }
  @test
  async tokenAndCallback() {
    this.mockClient();
    let ctx = await this.newContext();
    // Verify normal callback
    ctx.getParameters().state = "plop";
    ctx.getSession<OAuthSession>().oauth ??= {};
    ctx.getSession<OAuthSession>().oauth.state = "bouzouf";
    await assert.rejects(() => this.service.handleCallback(ctx), /403/);
    ctx.getSession<OAuthSession>().oauth.state = "plop";
    ctx.getParameters().code = "u1";
    assert.deepStrictEqual(await this.service.handleCallback(ctx), {
      identId: "u1",
      profile: { sub: "u1", email: "u1@webda.io" },
    });
    ctx.getParameters().code = "u2";
    await assert.rejects(() => this.service.handleCallback(ctx), /403/);

    // Verify tokens verification
    await assert.rejects(() => this.service.handleToken(ctx), /400/);
    ctx = await this.newContext({ tokens: { id_token: "u1" } });
    assert.deepStrictEqual(await this.service.handleToken(ctx), {
      identId: "u1",
      profile: { sub: "u1", email: "u1@webda.io" },
    });
  }

  @test
  async localClient() {
    const fakeClient = {};
    // @ts-ignore
    this.service._client = fakeClient;
    assert.strictEqual(
      await this.service.getLocalClient(null, null, null),
      fakeClient
    );
    // @ts-ignore
    this.service._client = undefined;
    let client = await this.service.getLocalClient(
      { id_token: "mytoken" },
      null,
      null
    );
    assert.deepStrictEqual(client.credentials, { id_token: "mytoken" });
    // @ts-ignore
    this.service._client = undefined;
    let calledUrl;
    await assert.rejects(
      async () =>
        this.service.getLocalClient(
          null,
          (url) => {
            calledUrl = url;
            fetch("http://localhost:3000/oauth2callback", undefined);
          },
          null
        ),
      /Failed/
    );
    this.mockClient();

    await assert.rejects(
      async () =>
        this.service.getLocalClient(
          null,
          (url) => {
            fetch("http://localhost:3000/oauth2callback?code=u2", undefined);
          },
          null
        ),
      /Cannot read propert/
    );
    let token;
    await this.service.getLocalClient(
      null,
      (url) => {
        // cov only
        fetch("http://localhost:3000/cov", {});
        fetch("http://localhost:3000/oauth2callback?code=u1", {});
      },
      async (t) => {
        token = t;
      }
    );
    assert.strictEqual(
      calledUrl,
      "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=email&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth2callback&response_type=code&client_id=fake"
    );
  }
}
