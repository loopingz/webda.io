import type { OperationDefinition } from "@webda/core";
import type { ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";

/**
 * A model exposed as MCP resources
 */
export interface ResourceModel {
  /**
   * Short model id as used in operation ids, e.g. "Post"
   */
  name: string;
  /**
   * Operation returning one instance, e.g. "Post.Get"
   */
  getOperationId: string;
  /**
   * Operation listing instances, e.g. "Posts.Query"
   */
  queryOperationId?: string;
  /**
   * Primary key fields, in URI order
   */
  pkFields: string[];
}

const SCHEME = "webda://";

/**
 * Registry of models exposed as `webda://{Model}/{pk...}` resources
 */
export class ResourceRegistry {
  protected entries: ResourceModel[] = [];

  /**
   * @param filter - model short ids to expose, or ["*"]
   */
  constructor(protected filter: string[]) {}

  /**
   * Rebuild from operations: every visible `{Model}.Get` with `context.pkFields`
   * becomes a model; its `.Query` operation shares the same `context.model`.
   * @param ops - visible operations
   */
  build(ops: Record<string, OperationDefinition>): void {
    this.entries = [];
    for (const [id, op] of Object.entries(ops)) {
      const match = /^(.+)\.Get$/.exec(id);
      const pkFields = op.context?.pkFields;
      if (!match || op.hidden || op.mcp === false || !Array.isArray(pkFields) || pkFields.length === 0) {
        continue;
      }
      const name = match[1];
      if (!this.filter.includes("*") && !this.filter.includes(name)) {
        continue;
      }
      const query = Object.entries(ops).find(
        ([qid, q]) => qid.endsWith(".Query") && !q.hidden && q.mcp !== false && q.context?.model !== undefined && q.context.model === op.context.model
      );
      this.entries.push({ name, getOperationId: id, queryOperationId: query?.[0], pkFields: pkFields.map(String) });
    }
    this.entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * @returns exposed models, sorted by name
   */
  models(): ResourceModel[] {
    return this.entries;
  }

  /**
   * @returns MCP resource templates
   */
  templates(): ResourceTemplate[] {
    return this.entries.map(m => ({
      uriTemplate: `${SCHEME}${m.name}/${m.pkFields.map(f => `{${f}}`).join("/")}`,
      name: m.name,
      mimeType: "application/json"
    }));
  }

  /**
   * @param model - the model
   * @param record - an instance (or key object)
   * @returns its resource URI
   */
  uriFor(model: ResourceModel, record: Record<string, unknown>): string {
    return `${SCHEME}${model.name}/${model.pkFields.map(f => encodeURIComponent(String(record[f]))).join("/")}`;
  }

  /**
   * @param uri - a resource URI
   * @returns the model and decoded key, or undefined when it does not match
   */
  parse(uri: string): { model: ResourceModel; key: Record<string, string> } | undefined {
    if (!uri.startsWith(SCHEME)) {
      return undefined;
    }
    const [name, ...segments] = uri.substring(SCHEME.length).split("/");
    const model = this.entries.find(m => m.name === name);
    if (!model || segments.length !== model.pkFields.length || segments.some(s => s === "")) {
      return undefined;
    }
    const key: Record<string, string> = {};
    try {
      model.pkFields.forEach((field, i) => (key[field] = decodeURIComponent(segments[i])));
    } catch {
      return undefined;
    }
    return { model, key };
  }
}

/**
 * @param cursor - model and continuation token
 * @returns opaque cursor
 */
export function encodeCursor(cursor: { model: string; token?: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/**
 * @param cursor - opaque cursor
 * @returns the decoded cursor, or undefined when absent or invalid
 */
export function decodeCursor(cursor: string | undefined): { model: string; token?: string } | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (typeof parsed?.model !== "string") {
      return undefined;
    }
    if (parsed.token !== undefined && typeof parsed.token !== "string") {
      return undefined;
    }
    return { model: parsed.model, ...(parsed.token !== undefined && { token: parsed.token }) };
  } catch {
    return undefined;
  }
}

/**
 * @param token - continuation token
 * @returns the WebdaQL query for one page
 */
export function queryFor(token?: string): string {
  if (token === undefined) {
    return "LIMIT 100";
  }
  const escaped = token.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `LIMIT 100 OFFSET "${escaped}"`;
}
