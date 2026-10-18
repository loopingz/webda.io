import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { INTERNAL_MODELS, isInternalModel } from "@webda/core";

const IDS = ["Webda/OAuthCode", "Webda/OAuthDeviceCode", "Webda/OAuthGrant"];

describe("OAuth models", () => {
  it("are listed as internal so DomainService never exposes them", () => {
    for (const id of IDS) {
      expect(INTERNAL_MODELS).toContain(id);
      expect(isInternalModel({ Metadata: { Identifier: id } })).toBe(true);
    }
  });
  it("are declared in the generated module under those identifiers", () => {
    const raw = readFileSync(new URL("../webda.module.json", import.meta.url), "utf8");
    for (const id of IDS) {
      expect(raw).toContain(`"${id}"`);
    }
  });
});
