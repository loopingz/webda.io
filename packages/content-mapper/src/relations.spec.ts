import { SyntaxKind } from "typescript/unstable/ast";
import { describe, expect, it } from "vitest";
import { backfillRelations, resolveRelationType, type PolicyRelations } from "./relations.ts";

describe("resolveRelationType", () => {
  it("keeps the written name when it resolves to no relation type", () => {
    const checker = { getSymbolAtLocation: () => undefined };
    const typeNode = { typeName: { kind: SyntaxKind.Identifier, text: "Binary" } };
    expect(resolveRelationType({ checker } as any, typeNode)).toEqual({ type: "Binary", contains: false });
    // A symbol without declarations
    checker.getSymbolAtLocation = () => ({ flags: 0 }) as any;
    expect(resolveRelationType({ checker } as any, typeNode)).toEqual({ type: "Binary", contains: false });
    // A symbol the checker cannot resolve
    checker.getSymbolAtLocation = () => {
      throw new Error("unresolvable");
    };
    expect(resolveRelationType({ checker } as any, typeNode)).toEqual({ type: "Binary", contains: false });
  });
});

describe("backfillRelations", () => {
  it("skips the relations without a known target and the policies NONE", () => {
    const models: Record<string, PolicyRelations> = {
      "App/Company": {
        maps: [
          // Not cascading, or no model: nothing to record
          { attribute: "staff", model: "App/Member", targetLink: "company", cascadeDelete: false },
          { attribute: "ghosts", targetLink: "company", cascadeDelete: true },
          // The parent attribute of the mapped model, and an attribute it does not declare
          { attribute: "members", model: "App/Member", targetLink: "company", cascadeDelete: true },
          { attribute: "guests", model: "App/Member", targetLink: "host", cascadeDelete: true }
        ]
      },
      "App/Member": {
        // No onDelete: CASCADE
        parent: { attribute: "company", model: "App/Company" },
        links: [
          // A target that is not a local model, and a link without a model (generic base)
          { attribute: "mentor", model: "Other/User", type: "LINK", onDelete: "SET_NULL" },
          { attribute: "owner", type: "LINK", onDelete: "CASCADE" }
        ]
      },
      "App/Draft": {
        parent: { attribute: "company", model: "App/Company", onDelete: "NONE" }
      },
      "App/Orphan": {
        // A parent from another module: not a child here
        parent: { attribute: "owner", model: "Other/User" }
      }
    };
    backfillRelations(models);
    // Draft declares Company as its parent with NONE: a child, not a dependent
    expect(models["App/Company"].children).toEqual(["App/Draft", "App/Member"]);
    expect(models["App/Company"].dependents).toEqual([
      { model: "App/Member", attribute: "company", type: "PARENT", onDelete: "CASCADE" },
      { model: "App/Member", attribute: "host", type: "LINK", onDelete: "CASCADE" }
    ]);
    expect(models["App/Member"]).not.toHaveProperty("children");
    expect(models["App/Member"]).not.toHaveProperty("dependents");
    expect(models["App/Orphan"]).not.toHaveProperty("children");
  });
});
