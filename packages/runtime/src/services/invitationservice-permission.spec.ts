import { describe, it } from "vitest";
import * as assert from "assert";
import { WebdaError } from "@webda/core";
import { InvitationService } from "./invitationservice.service.js";

/**
 * @param canAct - the model permission
 * @param method - HTTP method of the request
 * @returns the service and its context, without the full application
 */
function setup(canAct: (ctx: any, action: string) => Promise<any>, method: string = "POST") {
  const service: any = Object.create(InvitationService.prototype);
  const target: any = { uuid: "m1", canAct };
  service.model = { ref: () => ({ get: async () => target }) };
  service.parameters = { attribute: "__invitations", pendingAttribute: "__pendings" };
  const ctx: any = {
    getParameters: () => ({ uuid: "m1" }),
    getHttpContext: () => ({ getMethod: () => method }),
    getCurrentUser: async () => ({ getUuid: () => "u1" }),
    getCurrentUserId: () => "u1",
    write: () => {}
  };
  return { service, ctx };
}

describe("InvitationService permissions", () => {
  it("checks invite and uninvite with the model canAct(context, action)", async () => {
    const asked: string[] = [];
    // Readable, but neither invite nor uninvite allowed
    const canAct = async (_ctx: any, action: string) => {
      asked.push(action);
      return action === "get" ? true : "no";
    };
    let { service, ctx } = setup(canAct, "POST");
    await assert.rejects(() => service.invite(ctx), WebdaError.Forbidden);
    ({ service, ctx } = setup(canAct, "DELETE"));
    await assert.rejects(() => service.invite(ctx), WebdaError.Forbidden);
    assert.ok(asked.includes("invite") && asked.includes("uninvite"));
    // An unreadable object answers like a missing one
    ({ service, ctx } = setup(async () => false, "GET"));
    await assert.rejects(() => service.invite(ctx), WebdaError.NotFound);
  });
});
