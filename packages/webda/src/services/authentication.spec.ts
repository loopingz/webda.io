import { WebdaTest } from "../test";
import * as assert from "assert";
import {
  Authentication,
  Store,
  DebugMailer,
  CoreModel,
  Ident,
  Context,
  PasswordRecoveryInfos
} from "..";
import { suite, test } from "mocha-typescript";

const validationUrl = /.*\/auth\/email\/callback\?email=([^&]+)&token=([^& ]+)(&user=([^ &]+))?/;
var userId;
@suite
class AuthenticationTest extends WebdaTest {
  events: number = 0;
  userStore: Store<CoreModel>;
  identStore: Store<Ident>;
  mailer: DebugMailer;
  authentication: Authentication;

  getUserStore(): Store<any> {
    return <Store<any>>this.getService("Users");
  }

  getIdentStore(): Store<any> {
    return <Store<any>>this.getService("Idents");
  }

  async before() {
    await super.before();
    this.userStore = this.getUserStore();
    this.identStore = this.getIdentStore();
    assert.notEqual(this.userStore, undefined);
    assert.notEqual(this.identStore, undefined);
    await this.userStore.__clean();
    await this.identStore.__clean();
    this.authentication = <Authentication>this.getService("Authentication");
    this.mailer = <DebugMailer>this.getService("DefinedMailer");
    this.authentication.on("Login", () => {
      this.events++;
    });
    this.authentication.on("Register", evt => {
      this.events++;
      evt.user.test = "TESTOR";
    });
    this.mailer.sent = [];
  }

  async registerTest2(ctx: Context) {
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email",
      {
        login: "Test2@Webda.io",
        password: "testtest",
        register: true
      },
      {
        "Accept-Language": "en-GB,en;q=0.9,fr;q=0.8"
      }
    );
    ctx.newSession();
    executor._params.providers.email.postValidation = true;
    await executor.execute(ctx);
  }

  @test("register") async register() {
    let ctx = await this.newContext();
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email",
      {
        email: "test@Webda.io",
        password: "testtest"
      },
      {
        "Accept-Language": "en-GB,en;q=0.9,fr;q=0.8"
      }
    );
    this.events = 0;
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 400
    );
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email",
      {
        login: "test@Webda.io",
        password: "testtest"
      },
      {
        "Accept-Language": "en-GB,en;q=0.9,fr;q=0.8"
      }
    );
    // User unknown without register parameter
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 404
    );
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email",
      {
        login: "test@Webda.io",
        password: "testtest",
        register: true
      },
      {
        "Accept-Language": "en-GB,en;q=0.9,fr;q=0.8"
      }
    );
    ctx.newSession();
    await executor.execute(ctx);
    assert.equal(ctx.getSession().identId, undefined);
    assert.equal(this.mailer.sent.length, 1);
    let ident = await this.identStore.get("test@webda.io_email");
    assert.equal(ident, undefined);
    // Not registered as postValidation is not set
    executor._params.providers.email.postValidation = true;
    await this.registerTest2(ctx);
    assert.equal(this.events, 2); // Register + Login
    userId = ctx.getSession().getUserId();
    assert.notEqual(ctx.getSession().getUserId(), undefined);
    assert.equal(this.mailer.sent.length, 2);
    let user: any = await this.userStore.get(ctx.getSession().getUserId());
    assert.notEqual(user, undefined);
    assert.notEqual(user.getPassword(), undefined);
    assert.equal(user.locale, "en");
    assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
    // Now logout
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", "/auth");
    await executor.execute(ctx);
    // Now validate first user
    executor._params.providers.email.postValidation = false;
    assert.equal(ctx.getSession().getUserId(), undefined);
    var match = this.mailer.sent[0].replacements.url.match(validationUrl);
    assert.notEqual(match, undefined);
    assert.equal(match[1], "test@webda.io");
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", {
      token: match[2],
      password: "testtest",
      login: match[1],
      register: true,
      add: "plop"
    });
    await executor.execute(ctx);
    // Should create it with the dat provided
    assert.notEqual(ctx.getSession().getUserId(), undefined);
    ident = await this.identStore.get(ctx.getSession().getIdentUsed());
    // Email should be already validate
    assert.notEqual(ident._validation, undefined);
    assert.equal(this.mailer.sent.length, 2);
    // Resend email
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/test2@webda.io/validate"
    );
    ctx.getSession().login(userId, "fake");
    // Should be to soon to resend an email
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 429
    );
    ident = await this.identStore.get("test2@webda.io_email");
    ident._lastValidationEmail = 10;
    await ident.save();
    // Should be ok now to send an email
    await executor.execute(ctx);
    assert.equal(this.mailer.sent.length, 3);
    // Validate email for test2 now
    var match = this.mailer.sent[1].replacements.url.match(validationUrl);
    assert.notEqual(match, undefined);
    assert.equal(match[1], "test2@webda.io");
    ctx.newSession();
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/callback?email=" + match[1] + "&token=" + match[2]
    );
    await executor.execute(ctx);
    assert.equal(ctx.statusCode, 302);
    // Verify the skipEmailValidation parameter
    this.events = 0;
    ctx.newSession();
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", {
      login: "test4@webda.io",
      password: "testtest",
      register: true
    });
    executor._params.providers.email.postValidation = true;
    executor._params.providers.email.skipEmailValidation = true;
    await executor.execute(ctx);
    // No new email has been sent
    assert.equal(this.mailer.sent.length, 3);
    assert.equal(this.events, 2); // Register + Login
    assert.notEqual(ctx.getSession().getUserId(), undefined);
  }

  @test("register - bad password") async registerBadPassword() {
    // By default a password of 8 is needed
    var params = {
      login: "testBad@Webda.io",
      password: "test",
      register: true
    };
    let ctx = await this.newContext(params);
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email",
      {},
      {
        "Accept-Language": "en-GB"
      }
    );
    // Activate post validation
    executor._params.providers.email.postValidation = true;
    var error = false;
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 400
    );
  }

  @test("/me") async me() {
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", "/auth/me");
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 404
    );
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", {
      login: "test5@webda.io",
      password: "testtest",
      register: true,
      plop: "yep"
    });
    executor._params.providers.email.postValidation = true;
    await executor.execute(ctx);
    // Get me on known user
    executor = this.getExecutor(ctx, "test.webda.io", "GET", "/auth/me");
    await executor.execute(ctx);
    let user = JSON.parse(ctx.getResponseBody());
    assert.equal(user.plop, "yep");
    assert.equal(user.register, undefined);
    assert.equal(user.locale, "es-ES");
    assert.notEqual(user, undefined);
  }

  @test("login") async login() {
    let ctx = await this.newContext();
    await this.registerTest2(ctx);
    ctx.newSession();
    this.events = 0;
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email",
      {
        login: "test3@webda.io",
        password: "testtest"
      }
    );
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 404
    );
    assert.equal(ctx.getSession().getUserId(), undefined);
    // As it has not been validate
    ctx.getHttpContext().setBody({
      login: "test2@webda.io",
      password: "testtest"
    });
    ctx.newSession();
    await executor.execute(ctx);
    assert.equal(this.events, 1); // Login
    assert.notEqual(ctx.getSession().getUserId(), undefined);
    // Verify ident type
    let ident = await this.identStore.get(ctx.getSession().getIdentUsed());
    assert.equal(ident._type, "email");
    ctx.getHttpContext().setBody({
      login: "test2@webda.io",
      password: "bouzouf"
    });
    ctx.newSession();
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 403
    );
    assert.equal(ctx.getSession().getUserId(), undefined);
    assert.equal(this.events, 1);
  }

  @test("passwordRecovery") async testPasswordRecovery() {
    let tokenInfo: PasswordRecoveryInfos;
    let ctx = await this.newContext();
    await this.registerTest2(ctx);
    this.mailer.sent = [];
    this.events = 0;
    userId = ctx.getSession().getUserId();
    ctx.newSession();
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email/passwordRecovery",
      {
        login: userId,
        password: "retesttest"
      }
    );
    tokenInfo = await this.authentication.getPasswordRecoveryInfos(userId, -10);
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 400
    );
    // Missing the body
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email/passwordRecovery",
      {
        token: tokenInfo.token,
        expire: 123,
        password: "retesttest",
        login: userId
      }
    );
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 403
    );
    // Missing the body
    ctx.getHttpContext().setBody({
      token: tokenInfo.token,
      expire: tokenInfo.expire,
      password: "retesttest",
      login: userId
    });
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 410
    );
    tokenInfo = await this.authentication.getPasswordRecoveryInfos(userId);
    // Missing the body
    ctx
      .getHttpContext()
      .setBody({ ...tokenInfo, login: userId, password: "retesttest" });
    await executor.execute(ctx);
    // Should be update with password retest now
    ctx.newSession();
    executor = this.getExecutor(ctx, "test.webda.io", "POST", "/auth/email", {
      login: "test2@webda.io",
      password: "retesttest"
    });
    await executor.execute(ctx);
    assert.notEqual(ctx.getSession().getUserId(), undefined);
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/test2@webda.io/recover"
    );
    await executor.execute(ctx);
    assert.equal(this.mailer.sent.length, 1);
    assert.equal(this.mailer.sent[0].to, "test2@webda.io");
    assert.notEqual(this.mailer.sent[0].replacements.infos, undefined);
    assert.notEqual(this.mailer.sent[0].replacements.infos.expire, undefined);
    assert.notEqual(this.mailer.sent[0].replacements.infos.token, undefined);
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 429
    );
  }

  @test("add email to existing account") async addEmailToAccount() {
    // Log in as test2
    let ctx = await this.newContext();
    await this.registerTest2(ctx);
    this.mailer.sent = [];
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "POST",
      "/auth/email",
      {
        login: "test2@webda.io",
        password: "testtest"
      }
    );
    await executor.execute(ctx);
    assert.notEqual(ctx.getSession().getUserId(), undefined);
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/newtest@webda.io/validate",
      {
        login: "test2@webda.io",
        password: "retesttest"
      }
    );
    await executor.execute(ctx);
    let ident = await this.identStore.get("newtest@webda.io_email");
    assert.notEqual(ident, undefined);
    assert.equal(ident._validation, undefined);
    userId = ctx.getCurrentUserId();
    var match = this.mailer.sent[0].replacements.url.match(validationUrl);
    assert.notEqual(match, undefined);
    assert.equal(match[1], "newtest@webda.io");
    // Send another one on newtest2
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/newtest2@webda.io/validate",
      {
        login: "test2@webda.io",
        password: "retesttest"
      }
    );
    await executor.execute(ctx);
    var match2 = this.mailer.sent[1].replacements.url.match(validationUrl);
    assert.notEqual(match2, undefined);
    assert.equal(match2[1], "newtest2@webda.io");

    // Try to validate with wrong email
    ctx.getSession().userId = "anotheruser";
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/callback?email=" +
        match[1] +
        "&token=" +
        match[2] +
        "&user=" +
        match[4]
    );
    await executor.execute(ctx);
    assert.equal(ctx.statusCode, 302);
    assert.equal(
      ctx.getResponseHeaders().Location,
      "/login-error?reason=badUser"
    );
    // Right user
    ctx.getSession().userId = userId;
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/callback?email=" +
        match[1] +
        "&token=bouzouf" +
        "&user=" +
        match[4]
    );
    await executor.execute(ctx);
    assert.equal(ctx.statusCode, 302);
    assert.equal(
      ctx.getResponseHeaders().Location,
      "/login-error?reason=badToken"
    );
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/callback?email=" +
        match[1] +
        "&token=" +
        match[2] +
        "&user=" +
        match[4]
    );
    await executor.execute(ctx);
    assert.equal(ctx.statusCode, 302);
    assert.equal(
      ctx.getResponseHeaders().Location,
      "https://webda.io/user.html?validation=email"
    );
    ident = await this.identStore.get("newtest@webda.io_email");
    assert.notEqual(ident._validation, undefined);
    // Verify exception if same user try to revalidate
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/newtest@webda.io/validate"
    );
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 412
    );
    let user = await ctx.getCurrentUser();
    // Check ident is added to the user
    // TODO Redo this one
    /*
    assert.equal(
      user.getIdents().filter(item => item.uuid === "newtest@webda.io_email")
        .length,
      1
    );
    */
    // Verify exception if different user try to validate
    ctx.getSession().userId = "bouzouf";
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/newtest@webda.io/validate"
    );
    await this.assertThrowsAsync(
      executor.execute.bind(executor, ctx),
      res => res == 409
    );

    // Validation with no user
    ctx.newSession();
    executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/email/callback?email=" +
        match2[1] +
        "&token=" +
        match2[2] +
        "&user=" +
        match2[4]
    );
    await executor.execute(ctx);
    assert.equal(ctx.statusCode, 302);
    assert.equal(
      ctx.getResponseHeaders().Location,
      "https://webda.io/user.html?validation=email"
    );
  }

  @test("AWS Compatibility") async awsCompatibility() {
    let ctx = await this.newContext();
    let executor = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/github"
    );
    assert.notEqual(executor, undefined);
  }

  @test("Callback") async callback() {
    var done = function() {};
    var lastUsed = null;
    this.events = 0;
    let ident = Ident.init("github", "test");
    let ctx = await this.newContext();
    this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/auth/github/callback?code=blahblah"
    );
    await this.authentication.handleOAuthReturn(ctx, ident, done);
    assert.equal(ctx.statusCode, 302);
    assert.equal(ctx.parameter("code"), "blahblah");
    assert.equal(
      ctx.getResponseHeaders().Location,
      "https://webda.io/user.html?validation=github"
    );
    ident = await this.identStore.get(ident.uuid);
    // The ident must have been created and have a last used
    assert.notEqual(ident._lastUsed, lastUsed);
    lastUsed = ident._lastUsed;
    // Set by the store
    assert.notEqual(ident._lastUpdate, undefined);
    // Login + Register
    assert.equal(this.events, 2);
    this.events = 0;
    assert.equal(ctx.getSession().isLogged(), true);
    await this.sleep(50);
    await this.authentication.handleOAuthReturn(ctx, ident, done);
    await ident.refresh();
    assert.equal(this.events, 1); // Only Login
    assert.notEqual(ident._lastUsed, lastUsed);
    let user: any = await this.userStore.get(ident._user);
    this.events = 0;
    assert.equal(user.idents.length, 1); // Only one github login
    assert.equal(user.idents[0].uuid, "test_github"); // Only one github login
    assert.equal(user.test, "TESTOR"); // Verify that the listener on Register has done something
    await this.authentication.handleOAuthReturn(
      ctx,
      Ident.init("github", "retest"),
      done
    );
    assert.equal(this.events, 1); // Only Login
    assert.equal(ctx.statusCode, 302);
    assert.equal(
      ctx.getResponseHeaders().Location,
      "https://webda.io/user.html?validation=github"
    );
    user = await this.userStore.get(ident._user);
    assert.equal(user.idents.length, 2); // Two github login
    assert.equal(user.idents[1].uuid, "retest_github");
  }
}
