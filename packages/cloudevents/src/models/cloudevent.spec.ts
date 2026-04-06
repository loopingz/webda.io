import { describe, expect, it } from "vitest";
import { isCloudEvent } from "./cloudevent";

const VALID_EVENT = {
  specversion: "1.0",
  type: "com.example.test",
  source: "/test",
  id: "123"
};

describe("isCloudEvent", () => {
  describe("loose mode", () => {
    it("should accept a valid CloudEvent object", () => {
      expect(isCloudEvent(VALID_EVENT)).toBe(true);
    });

    it("should accept with optional attributes", () => {
      expect(
        isCloudEvent({
          ...VALID_EVENT,
          time: "2026-01-01T00:00:00Z",
          subject: "test",
          datacontenttype: "application/json",
          dataschema: "https://example.com/schema",
          data: { key: "value" }
        })
      ).toBe(true);
    });

    it("should accept empty strings in loose mode", () => {
      expect(isCloudEvent({ ...VALID_EVENT, type: "" })).toBe(true);
    });

    it("should reject null", () => {
      expect(isCloudEvent(null)).toBe(false);
    });

    it("should reject undefined", () => {
      expect(isCloudEvent(undefined)).toBe(false);
    });

    it("should reject primitives", () => {
      expect(isCloudEvent("string")).toBe(false);
      expect(isCloudEvent(42)).toBe(false);
      expect(isCloudEvent(true)).toBe(false);
    });

    it("should reject arrays", () => {
      expect(isCloudEvent([1, 2, 3])).toBe(false);
    });

    it("should reject objects missing required attributes", () => {
      for (const attr of ["specversion", "type", "source", "id"]) {
        const event = { ...VALID_EVENT };
        delete event[attr as keyof typeof event];
        expect(isCloudEvent(event)).toBe(false);
      }
    });

    it("should reject non-string required attributes", () => {
      expect(isCloudEvent({ ...VALID_EVENT, specversion: 1 })).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, type: null })).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, source: 123 })).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, id: true })).toBe(false);
    });
  });

  describe("strict mode", () => {
    it("should accept a valid CloudEvent", () => {
      expect(isCloudEvent(VALID_EVENT, true)).toBe(true);
    });

    it("should accept with valid optional attributes", () => {
      expect(
        isCloudEvent(
          {
            ...VALID_EVENT,
            time: "2026-01-01T00:00:00Z",
            subject: "test-subject",
            datacontenttype: "application/json",
            dataschema: "https://example.com/schema"
          },
          true
        )
      ).toBe(true);
    });

    it("should accept time with fractional seconds", () => {
      expect(isCloudEvent({ ...VALID_EVENT, time: "2026-01-01T00:00:00.123Z" }, true)).toBe(true);
    });

    it("should accept time with timezone offset", () => {
      expect(isCloudEvent({ ...VALID_EVENT, time: "2026-01-01T00:00:00+02:00" }, true)).toBe(true);
    });

    it("should reject empty required attributes", () => {
      expect(isCloudEvent({ ...VALID_EVENT, type: "" }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, source: "" }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, id: "" }, true)).toBe(false);
    });

    it("should reject wrong specversion", () => {
      expect(isCloudEvent({ ...VALID_EVENT, specversion: "0.3" }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, specversion: "2.0" }, true)).toBe(false);
    });

    it("should reject invalid time format", () => {
      expect(isCloudEvent({ ...VALID_EVENT, time: "not-a-date" }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, time: "2026-01-01" }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, time: 12345 }, true)).toBe(false);
    });

    it("should reject empty optional string attributes", () => {
      expect(isCloudEvent({ ...VALID_EVENT, subject: "" }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, datacontenttype: "" }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, dataschema: "" }, true)).toBe(false);
    });

    it("should reject non-string optional attributes", () => {
      expect(isCloudEvent({ ...VALID_EVENT, subject: 123 }, true)).toBe(false);
      expect(isCloudEvent({ ...VALID_EVENT, datacontenttype: true }, true)).toBe(false);
    });
  });
});
