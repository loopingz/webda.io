

import { describe, it, expect } from "vitest";
import { DEFAULT_COERCIONS } from "./coercions";
import type { CoercionRegistry, CoercionRule } from "./coercions";

describe("coercions", () => {
  describe("DEFAULT_COERCIONS", () => {
    it("should have a Date entry", () => {
      expect(DEFAULT_COERCIONS).toHaveProperty("Date");
    });

    it("should have correct setter type for Date", () => {
      expect(DEFAULT_COERCIONS.Date.setterType).toBe("string | number | Date");
    });

    it("should only contain Date by default", () => {
      const keys = Object.keys(DEFAULT_COERCIONS);
      expect(keys).toEqual(["Date"]);
    });
  });

  describe("CoercionRegistry type", () => {
    it("should accept custom coercion entries", () => {
      const custom: CoercionRegistry = {
        ...DEFAULT_COERCIONS,
        Decimal: { setterType: "string | number | Decimal" },
        BigInt: { setterType: "string | BigInt" }
      };
      expect(Object.keys(custom)).toHaveLength(3);
      expect(custom.Decimal.setterType).toBe("string | number | Decimal");
      expect(custom.BigInt.setterType).toBe("string | BigInt");
    });

    it("should allow overriding the Date entry", () => {
      const custom: CoercionRegistry = {
        Date: { setterType: "string | Date" }
      };
      expect(custom.Date.setterType).toBe("string | Date");
    });
  });
});
