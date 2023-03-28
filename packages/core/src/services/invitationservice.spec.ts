import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import { WebdaError } from "../errors";
import { AclModel } from "../models/aclmodel";
import { CoreModel } from "../models/coremodel";
import { Store } from "../stores/store";
import { WebdaTest } from "../test";
import { OperationContext } from "../utils/context";
import { Authentication } from "./authentication";
import InvitationService, { InvitationParameters } from "./invitationservice";
import { Mailer } from "./mailer";

class MyCompany extends AclModel {
  async canAct(ctx: OperationContext, action: string) {
    if (action === "create") {
      return;
    }
    return super.canAct(ctx, action);
  }
}

@suite
class InvitationTest extends WebdaTest {
  service: InvitationService;

  store: Store<AclModel>;

  invitations: Store<CoreModel>;

  authentication: Authentication;

  mailer: Mailer;

  getTestConfiguration(): string {
    return process.cwd() + "/test/config-invitation.json";
  }

  async before() {
    await super.before();
    this.service = this.registerService(
      new InvitationService(this.webda, "invit", {
        modelStore: "Companies",
        invitationStore: "Invitations",
        attribute: "__acl",
        mapAttribute: "_companies",
        pendingAttribute: "__invitations",
        notificationService: "DebugMailer",
        mapFields: ["name"]
      })
    );
    this.store = this.webda.getService<Store<AclModel>>("Companies");
    this.store._model = <any>MyCompany;
    this.invitations = this.webda.getService<Store<CoreModel>>("Invitations");
    this.authentication = this.webda.getService<Authentication>("Authentication");
    this.mailer = this.webda.getService<Mailer>("DebugMailer");
    await this.service.resolve().init();
  }

  @test
  params() {
    let p = new InvitationParameters({
      mapFields: "test,test2",
      attribute: "_attr"
    });
    assert.deepStrictEqual(p.mapFields, ["test", "test2"]);
    assert.strictEqual(p.pendingAttribute, "_attrPending");
    assert.strictEqual(p.multiple, true);
    assert.strictEqual(p.authenticationService, "Authentication");
    assert.throws(
      () =>
        new InvitationParameters({
          attribute: "plop"
        }),
      /needs to start with a _/
    );
    assert.throws(
      () =>
        new InvitationParameters({
          attribute: "_plop",
          pendingAttribute: "bouzouf"
        }),
      /needs to start with a _/
    );
    assert.throws(
      () =>
        new InvitationParameters({
          autoAccept: true,
          multiple: false,
          fields: "test,test2",
          attribute: "_attr"
        }),
      /You cannot have multiple=false with autoAccept=true/
    );
  }

  @test
  async initNoTemplate() {
    let stub = sinon.stub(this.mailer, "hasNotification").callsFake(() => false);
    try {
      this.service.getParameters().notification = "plop";
      await assert.rejects(() => this.service.init(), /Email template should exist/);
    } finally {
      stub.restore();
    }
  }

  @test
  async inviteOnMissing() {
    let ctx = await this.newContext();
    await assert.rejects(
      () => this.execute(ctx, "test.webda.io", "POST", `/companies/unknown/invitations`, {}),
      WebdaError.NotFound
    );
  }

  @test
  async inviteOnAclWithAutoAccept() {
    this.service.getParameters().autoAccept = true;
    this.service.getParameters().notification = "COMPANY_INVITE";
    sinon.stub(this.service.notificationService, "sendNotification").callsFake(async () => {});
    // New model as owner
    let ctx = await this.newContext();
    let user = await this.authentication.getUserStore().save({ displayName: "Webda.io Test" });
    ctx.getSession().userId = user.getUuid();
    let res = await this.execute(ctx, "test.webda.io", "POST", "/companies", {
      name: "MyTestCompany"
    });
    const company = await this.store.get(res.uuid);

    // Auto register 2 users
    await this.authentication.createUserWithIdent("email", "test1@webda.io");
    await this.authentication.createUserWithIdent("email", "test2@webda.io");
    const ident1 = await this.authentication.getIdentStore().get(`test1@webda.io_email`);
    const ident2 = await this.authentication.getIdentStore().get(`test2@webda.io_email`);

    // Add four users to the ACL
    // 2 unregistered , 2 registered
    await this.execute(ctx, "test.webda.io", "POST", `/companies/${company.getUuid()}/invitations`, {
      idents: ["test1@webda.io_email", "test3@webda.io_email", "test4@webda.io_email"],
      users: [ident2.getUser(), "unknown"],
      metadata: "read"
    });
    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [ident1.getUser().toString()]: "read",
      [ident2.getUser().toString()]: "read",
      [user.getUuid()]: "all"
    });
    let getter = await this.execute(ctx, "test.webda.io", "GET", `/companies/${company.getUuid()}/invitations`);
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {
      "ident_test3@webda.io_email": "read",
      "ident_test4@webda.io_email": "read"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, getter);
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        ...i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      [
        {
          uuid: "test3@webda.io_email_invit",
          metadata: "read",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        },
        {
          uuid: "test4@webda.io_email_invit",
          metadata: "read",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        }
      ]
    );

    // Reinviting should be handled and metadata overwritten
    await this.execute(ctx, "test.webda.io", "POST", `/companies/${company.getUuid()}/invitations`, {
      idents: ["test2@webda.io_email", "test3@webda.io_email", "test4@webda.io_email"],
      users: [ident1.getUser()],
      metadata: "read,write"
    });

    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [ident1.getUser().toString()]: "read,write",
      [ident2.getUser().toString()]: "read,write",
      [user.getUuid()]: "all"
    });
    let userCheck = await this.authentication.getUserStore().get(ident1.getUser().toString());
    assert.deepStrictEqual(userCheck["_companies"], [
      {
        inviter: {
          displayName: "Webda.io Test",
          uuid: user.getUuid()
        },
        metadata: {
          name: "MyTestCompany"
        },
        model: company.getUuid(),
        pending: false
      }
    ]);
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {
      "ident_test3@webda.io_email": "read,write",
      "ident_test4@webda.io_email": "read,write"
    });
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        ...i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      [
        {
          uuid: "test3@webda.io_email_invit",
          metadata: "read,write",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        },
        {
          uuid: "test4@webda.io_email_invit",
          metadata: "read,write",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        }
      ]
    );
    // Remove 1 unregistered and one registered from the ACL
    await this.execute(ctx, "test.webda.io", "DELETE", `/companies/${company.getUuid()}/invitations`, {
      idents: ["test1@webda.io_email", "test3@webda.io_email"]
    });

    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [ident2.getUser().toString()]: "read,write",
      [user.getUuid()]: "all"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {
      "ident_test4@webda.io_email": "read,write"
    });
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        ...i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      [
        { uuid: "test3@webda.io_email_invit" },
        {
          uuid: "test4@webda.io_email_invit",
          metadata: "read,write",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        }
      ]
    );

    // Missing model
    await this.invitations.setAttribute("test4@webda.io_email_invit", <any>"invit_test", "all");

    // Register user 3 and 4
    await this.authentication.createUserWithIdent("email", "test3@webda.io");
    await this.authentication.createUserWithIdent("email", "test4@webda.io");
    const ident3 = await this.authentication.getIdentStore().get(`test3@webda.io_email`);
    const ident4 = await this.authentication.getIdentStore().get(`test4@webda.io_email`);

    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [ident2.getUser().toString()]: "read,write",
      [ident4.getUser().toString()]: "read,write",
      [user.getUuid()]: "all"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {});
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        metadata: i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      []
    );
    userCheck = await this.authentication.getUserStore().get(ident3.getUser().toString());
    assert.deepStrictEqual(userCheck["_companies"] || [], []);
    userCheck = await this.authentication.getUserStore().get(ident4.getUser().toString());
    assert.deepStrictEqual(userCheck["_companies"], [
      {
        inviter: {
          displayName: "Webda.io Test",
          uuid: user.getUuid()
        },
        metadata: {
          name: "MyTestCompany"
        },
        model: company.getUuid(),
        pending: false
      }
    ]);
  }

  @test
  async inviteOnAclWithoutAutoAccept() {
    this.service.getParameters().autoAccept = false;
    // New model as owner
    let ctx = await this.newContext();
    let user = await this.authentication.getUserStore().save({
      displayName: "Webda.io Test"
    });
    ctx.getSession().userId = user.getUuid();
    let res = await this.execute(ctx, "test.webda.io", "POST", "/companies", {
      name: "MyTestCompany"
    });
    const company = await this.store.get(res.uuid);

    // Auto register 2 users
    await this.authentication.createUserWithIdent("email", "test1@webda.io");
    await this.authentication.createUserWithIdent("email", "test2@webda.io");
    const ident1 = await this.authentication.getIdentStore().get(`test1@webda.io_email`);
    const ident2 = await this.authentication.getIdentStore().get(`test2@webda.io_email`);

    // Add four users to the ACL
    // 2 unregistered , 2 registered
    await this.execute(ctx, "test.webda.io", "POST", `/companies/${company.getUuid()}/invitations`, {
      idents: ["test1@webda.io_email", "test3@webda.io_email", "test4@webda.io_email"],
      users: [ident2.getUser()],
      metadata: "read"
    });
    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [user.getUuid()]: "all"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {
      [`user_${ident1.getUser()}`]: "read",
      [`user_${ident2.getUser()}`]: "read",
      "ident_test3@webda.io_email": "read",
      "ident_test4@webda.io_email": "read"
    });
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        ...i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      [
        {
          uuid: "test3@webda.io_email_invit",
          metadata: "read",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        },
        {
          uuid: "test4@webda.io_email_invit",
          metadata: "read",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        }
      ]
    );
    let userCheck = await this.authentication.getUserStore().get(ident1.getUser().toString());
    assert.deepStrictEqual(userCheck["_companies"], [
      {
        inviter: {
          displayName: "Webda.io Test",
          uuid: user.getUuid()
        },
        metadata: {
          name: "MyTestCompany"
        },
        model: company.getUuid(),
        pending: true
      }
    ]);
    userCheck["_companies"] = [
      {
        model: "Test"
      },
      ...userCheck["_companies"]
    ];
    // @ts-ignore
    await userCheck.save("_companies");

    // Accepting the invite for user1
    let ctx2 = await this.newContext();
    ctx2.getSession().userId = ident1.getUser().toString();
    await this.execute(ctx2, "test.webda.io", "PUT", `/companies/${company.getUuid()}/invitations`, {
      accept: true
    });
    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [ident1.getUser().toString()]: "read",
      [user.getUuid()]: "all"
    });

    // Reinviting should be handled and metadata overwritten
    await this.execute(ctx, "test.webda.io", "POST", `/companies/${company.getUuid()}/invitations`, {
      idents: ["test1@webda.io_email", "test2@webda.io_email", "test3@webda.io_email", "test4@webda.io_email"],
      metadata: "read,write"
    });

    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [ident1.getUser().toString()]: "read",
      [user.getUuid()]: "all"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {
      [`user_${ident2.getUser()}`]: "read,write",
      "ident_test3@webda.io_email": "read,write",
      "ident_test4@webda.io_email": "read,write"
    });
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        ...i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      [
        {
          uuid: "test3@webda.io_email_invit",
          metadata: "read,write",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        },
        {
          uuid: "test4@webda.io_email_invit",
          metadata: "read,write",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        }
      ]
    );
    // Remove 1 unregistered and one registered from the ACL
    await this.execute(ctx, "test.webda.io", "DELETE", `/companies/${company.getUuid()}/invitations`, {
      idents: ["test3@webda.io_email"],
      users: [ident1.getUser(), ident2.getUser()]
    });
    // Ensure double delete will not be an issue
    await this.execute(ctx, "test.webda.io", "DELETE", `/companies/${company.getUuid()}/invitations`, {
      users: [ident1.getUser(), ident2.getUser()]
    });

    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [user.getUuid()]: "all"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {
      "ident_test4@webda.io_email": "read,write"
    });
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        ...i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      [
        { uuid: "test3@webda.io_email_invit" },
        {
          uuid: "test4@webda.io_email_invit",
          metadata: "read,write",
          inviter: {
            uuid: user.getUuid(),
            displayName: "Webda.io Test"
          }
        }
      ]
    );
    userCheck = await this.authentication.getUserStore().get(ident1.getUser().toString());
    assert.deepStrictEqual(userCheck["_companies"], [
      {
        model: "Test"
      }
    ]);
    userCheck = await this.authentication.getUserStore().get(ident2.getUser().toString());
    assert.deepStrictEqual(userCheck["_companies"], []);

    // Missing model
    await this.invitations.setAttribute("test4@webda.io_email_invit", <any>"invit_test", "all");

    // Register user 3 and 4
    await this.authentication.createUserWithIdent("email", "test3@webda.io");
    await this.authentication.createUserWithIdent("email", "test4@webda.io");
    await this.authentication.getIdentStore().get(`test3@webda.io_email`);
    const ident4 = await this.authentication.getIdentStore().get(`test4@webda.io_email`);

    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [user.getUuid()]: "all"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {
      "ident_test4@webda.io_email": "read,write"
    });
    assert.deepStrictEqual(
      (await this.invitations.getAll()).map(i => ({
        uuid: i.getUuid(),
        ...i[this.service.getInvitationAttribute(company.getUuid())]
      })),
      []
    );
    ctx2.getSession().userId = ident4.getUser().toString();
    // Force refresh of user as we changed user manually
    await ctx2.getCurrentUser(true);
    await this.execute(ctx2, "test.webda.io", "PUT", `/companies/${company.getUuid()}/invitations`, {
      accept: true
    });
    await company.refresh();
    assert.deepStrictEqual(company.__acl, {
      [user.getUuid()]: "all",
      [ident4.getUser().toString()]: "read,write"
    });
    // @ts-ignore
    assert.deepStrictEqual(company.__invitations, {});
  }

  @test
  async invitationDeletedModel() {
    this.service.getParameters().autoAccept = false;
    // New model as owner
    let ctx = await this.newContext();
    let user = await this.authentication.getUserStore().save({
      displayName: "Webda.io Test"
    });
    ctx.getSession().userId = user.getUuid();
    let res = await this.execute(ctx, "test.webda.io", "POST", "/companies", {
      name: "MyTestCompany"
    });
    const company = await this.store.get(res.uuid);

    // Auto register 2 users
    await this.authentication.createUserWithIdent("email", "test1@webda.io");
    const ident1 = await this.authentication.getIdentStore().get(`test1@webda.io_email`);

    // Add two users to the ACL
    // 1 unregistered , 1 registered
    await this.execute(ctx, "test.webda.io", "POST", `/companies/${company.getUuid()}/invitations`, {
      idents: ["test2@webda.io_email"],
      users: [ident1.getUser()],
      metadata: "read"
    });

    await company.delete();
    let checkUser = await this.authentication.getUserStore().get(ident1.getUser().toString());
    assert.strictEqual(checkUser["_companies"].length, 1);
    // Accepting the invite for user1
    let ctx2 = await this.newContext();
    ctx2.getSession().userId = ident1.getUser().toString();
    // It should be removed and get a 410 error code
    await assert.rejects(
      () =>
        this.execute(ctx2, "test.webda.io", "PUT", `/companies/${company.getUuid()}/invitations`, {
          accept: true
        }),
      WebdaError.Gone
    );
    await checkUser.refresh();
    assert.strictEqual(checkUser["_companies"].length, 0);
    // Register pending one
    await this.authentication.createUserWithIdent("email", "test2@webda.io");
    const ident2 = await this.authentication.getIdentStore().get(`test2@webda.io_email`);
    checkUser = await this.authentication.getUserStore().get(ident2.getUser().toString());
    assert.strictEqual(checkUser["_companies"].length, 0);
  }
}
