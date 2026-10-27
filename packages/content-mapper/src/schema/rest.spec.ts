import { describe, expect, it } from "vitest";
import { bindActionRest } from "./rest.ts";
import type { JSONSchema7 } from "./types.ts";

describe("REST binding validation", () => {
  it("allows implicit model primary keys and records the body and URL fields", () => {
    const input: JSONSchema7 = {
      type: "object",
      properties: { name: { type: "string" }, notify: { type: "boolean" } },
      required: ["name"]
    };
    bindActionRest(input, { method: "post", path: "{tenant}/{slug}/assign{?notify?}" }, ["tenant", "slug"]);
    expect(input["x-webda-rest"]).toEqual({
      method: "post",
      template: "{tenant}/{slug}/assign{?notify?}",
      path: ["tenant", "slug"],
      query: [{ name: "notify", required: false }],
      body: ["name"]
    });
  });

  it("rejects unknown template names and parameters bound twice", () => {
    const input: JSONSchema7 = { properties: { name: { type: "string" } } };
    expect(() => bindActionRest(input, { path: "{typo}" })).toThrow(/typo.*does not match/);
    expect(() => bindActionRest(input, { path: "{name}{?name}" })).toThrow(/more than once/);
    expect(() => bindActionRest(input, { path: "{?name}/suffix" })).toThrow(/must be last/);
  });

  it("rejects objects and implicit arrays on verbs with no body", () => {
    for (const method of ["get", "delete"]) {
      for (const property of [{ type: "object" }, { type: "array", items: { type: "string" } }]) {
        expect(() =>
          bindActionRest({ properties: { value: property } } as JSONSchema7, { method, path: "values" })
        ).toThrow(/value.*must be scalar/);
      }
    }
    expect(() =>
      bindActionRest({ properties: { value: { type: "object" } } }, { method: "post", path: "{value}" })
    ).toThrow(/value.*must be scalar/);
  });

  it("accepts explicit scalar arrays and catch-all scalar objects, resolving named types", () => {
    const input: JSONSchema7 = {
      properties: {
        tags: { type: "array", items: { type: "number" } },
        filters: { $ref: "#/definitions/Filters%3CT%3E" }
      },
      definitions: {
        "Filters<T>": {
          type: "object",
          properties: { active: { type: "boolean" } },
          additionalProperties: { type: "number" }
        }
      }
    };
    bindActionRest(input, { method: "get", path: "values{?tags?,filters*}" });
    expect((input["x-webda-rest"] as any).query[1]).toEqual({ name: "filters", required: false, catchAll: true });
    expect(() =>
      bindActionRest(
        { properties: { filters: { type: "object", properties: { nested: { type: "object" } } } } },
        { path: "{?filters*}" }
      )
    ).toThrow(/object of scalar/);
  });

  it("requires an unambiguous whole-body parameter", () => {
    const input: JSONSchema7 = { properties: { payload: { type: "object" }, other: { type: "string" } } };
    expect(() => bindActionRest(input, { method: "post", body: "payload" })).toThrow(/only body parameter/);
    expect(() => bindActionRest(input, { method: "get", body: "payload" })).toThrow(/POST\/PUT\/PATCH/);
    bindActionRest(input, { method: "post", path: "{other}", body: "payload" });
    expect((input["x-webda-rest"] as any).bodyParameter).toBe("payload");
  });
});
