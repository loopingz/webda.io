import { describe, it } from "vitest";
import * as assert from "assert";
import { WebdaError } from "@webda/core";
import { InvitationService } from "./invitationservice.service.js";

/**
 * @param target - the stored model, undefined when missing
 * @param method - HTTP method of the request
 * @param user - current user id
 * @returns the service and its context, without the full application
 */
function setup(target: any, method: string = "POST", user: string = "u1") {
  const service: any = Object.create(InvitationService.prototype);
  service.model = {
    ref: () => ({
      get: async () => {
        if (!target) throw new Error("Not found: m1");
        return target;
      }
    })
  };
  service.parameters = { attribute: "__invitations", pendingAttribute: "__pendings" };
  service.removed = [];
  service.removeInvitationFromUser = async (userId: string, uuid: string) => service.removed.push([userId, uuid]);
  service.patched = 0;
  service.updateModel = async () => service.patched++;
  service.emit = () => {};
  const ctx: any = {
    getParameters: () => ({ uuid: "m1" }),
    getHttpContext: () => ({ getMethod: () => method }),
    getCurrentUser: async () => ({ getUUID: () => user, getIdents: () => [] }),
    getCurrentUserId: () => user,
    getInput: async () => ({ accept: true }),
    getRequestBody: async () => ({}),
    write: () => {}
  };
  return { service, ctx };
}

/**
 * @param fn - the call
 * @returns the error class and message, or "ok"
 */
async function outcome(fn: () => Promise<any>): Promise<any> {
  try {
    await fn();
    return "ok";
  } catch (err) {
    return { type: err.constructor.name, message: err.message };
  }
}

const model = (canAct: (ctx: any, action: string) => Promise<any>, pendings: any = {}) => ({
  uuid: "m1",
  canAct,
  __invitations: {},
  __pendings: pendings
});

describe("InvitationService permissions", () => {
  it("checks invite and uninvite with the model canAct(context, action)", async () => {
    const asked: string[] = [];
    // Readable, but neither invite nor uninvite allowed
    const canAct = async (_ctx: any, action: string) => {
      asked.push(action);
      return action === "get" ? true : "no";
    };
    let { service, ctx } = setup(model(canAct), "POST");
    await assert.rejects(() => service.invite(ctx), WebdaError.Forbidden);
    ({ service, ctx } = setup(model(canAct), "DELETE"));
    await assert.rejects(() => service.invite(ctx), WebdaError.Forbidden);
    assert.ok(asked.includes("invite") && asked.includes("uninvite"));
  });

  it("a missing and an unreadable model answer the same", async () => {
    const hidden = model(async () => false);
    for (const method of ["GET", "POST", "DELETE", "PUT"]) {
      const refused = setup(hidden, method);
      const missing = setup(undefined, method);
      const a = await outcome(() => refused.service.invite(refused.ctx));
      const b = await outcome(() => missing.service.invite(missing.ctx));
      assert.notStrictEqual(a, "ok", method);
      assert.deepStrictEqual(a, b, method);
      assert.strictEqual(refused.service.patched, 0, `${method}: nothing written`);
    }
  });

  it("an invited user can answer without being able to read the model", async () => {
    const invited = setup(
      model(async () => false, { user_u1: { role: "editor" } }),
      "PUT"
    );
    assert.strictEqual(await outcome(() => invited.service.invite(invited.ctx)), "ok");
    assert.strictEqual(invited.service.patched, 1);
  });
});
