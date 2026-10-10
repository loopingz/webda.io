import { callOperation, CoreModel, OperationContext, useCore } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { SyncChange } from "../src/server/syncchange.model.js";
import { SyncService, SyncServiceParameters } from "../src/server/sync.service.js";
import type { Syncable } from "../src/server/syncable.js";

/**
 * Synced test model: readable and writable by its owner, or by anyone when it has no owner
 */
export class Note extends CoreModel implements Syncable {
  title: string;
  owner?: string;
  status?: string;
  body?: string;
  count?: number;
  tags?: string[];
  due?: Date;
  _rev?: number;

  /**
   * @param context - the caller
   * @param _action - the action
   * @param object - the object
   * @returns true or the refusal reason
   */
  static canAct(context: any, _action: string, object?: Note): true | string {
    if (!object?.owner) return true;
    return object.owner === context?.getCurrentUserId?.() ? true : "not the owner";
  }
}

export const NOTE_SCHEMA = {
  type: "object",
  properties: {
    uuid: { type: "string" },
    title: { type: "string" },
    owner: { type: "string" },
    status: { type: "string" },
    body: { type: "string" },
    count: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
    due: { type: "string", format: "date-time" },
    _rev: { type: "number" }
  },
  required: ["title"]
};

/**
 * Operation context with a stubbed user and a JSON body
 */
export class UserContext extends OperationContext {
  /**
   *
   * @param userId - the userId
   * @param body - the body
   */
  constructor(
    protected userId?: string,
    protected body?: any
  ) {
    super();
  }
  /**
   *
   * @returns the result
   */
  getCurrentUserId(): any {
    return this.userId;
  }
  /**
   *
   * @returns the result
   */
  async getRawInputAsString(): Promise<string> {
    return this.body === undefined ? "" : JSON.stringify(this.body);
  }
  /**
   *
   * @returns the result
   */
  async getRawInput(): Promise<Buffer> {
    return Buffer.from(await this.getRawInputAsString());
  }
}

/**
 * Base test: SyncService, SyncChange and Note from sources
 */
export class SyncTest extends WebdaApplicationTest {
  /**
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModel("Webda/SyncChange", SyncChange, app.getModel("Webda/SyncChange").Metadata);
    (SyncChange as any).registerSerializer(true, "Webda/SyncChange");
    app.getSchemas()["Test/Note"] = <any>NOTE_SCHEMA;
    app.addModel("Test/Note", Note, {
      Identifier: "Test/Note",
      Ancestors: [],
      Subclasses: [],
      Relations: {},
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: { Input: <any>NOTE_SCHEMA },
      Actions: {},
      Import: "",
      Plural: "Notes",
      Reflection: {}
    } as any);
    (Note as any).registerSerializer(true, "Test/Note");
    (SyncService as any).createConfiguration = (params: any = {}) => new SyncServiceParameters().load(params);
    app.addModda("Webda/SyncService", SyncService);
  }

  /**
   *
   * @returns the result
   */
  get sync(): SyncService {
    return useCore().getService<SyncService>("sync");
  }

  /**
   * Call an operation
   * @param operationId - the operation id
   * @param body - the JSON body
   * @param userId - the caller
   * @returns the parsed output
   */
  async op(operationId: string, body: any = {}, userId?: string): Promise<any> {
    const ctx = new UserContext(userId, body);
    await ctx.init();
    await callOperation(ctx, operationId);
    const out = ctx.getOutput();
    return typeof out === "string" && out ? JSON.parse(out) : out;
  }

  /**
   * @returns every change-log entry, oldest first
   */
  async changes(): Promise<SyncChange[]> {
    return (await SyncChange.query("ORDER BY seq ASC LIMIT 1000")).results;
  }

  /**
   *
   */
  async afterEach() {
    for (const note of (await Note.query("")).results) await note.delete();
    for (const change of await this.changes()) await change.delete();
    await super.afterEach();
  }
}
