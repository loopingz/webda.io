import { describe, it, expect } from "vitest";
import { extractFields } from "./parser.js";

describe("extractFields", () => {
  describe("SELECT", () => {
    it("detects implicit SELECT (field list with comma)", () => {
      const result = extractFields("name, age WHERE status = 'active'");
      expect(result.type).toBe("SELECT");
      expect(result.fields).toEqual(["name", "age"]);
    });

    it("detects explicit SELECT", () => {
      const result = extractFields("SELECT name, age WHERE status = 'active'");
      expect(result.type).toBe("SELECT");
      expect(result.fields).toEqual(["name", "age"]);
    });

    it("handles lowercase select", () => {
      const result = extractFields("select name, email where id = 1");
      expect(result.type).toBe("SELECT");
      expect(result.fields).toEqual(["name", "email"]);
    });

    it("handles nested dot-notation fields", () => {
      const result = extractFields("name, profile.email WHERE active = TRUE");
      expect(result.type).toBe("SELECT");
      expect(result.fields).toEqual(["name", "profile.email"]);
    });

    it("handles SELECT without WHERE", () => {
      const result = extractFields("name, age");
      expect(result.type).toBe("SELECT");
      expect(result.fields).toEqual(["name", "age"]);
    });

    it("handles SELECT with ORDER BY/LIMIT", () => {
      const result = extractFields("name, age ORDER BY name ASC LIMIT 10");
      expect(result.type).toBe("SELECT");
      expect(result.fields).toEqual(["name", "age"]);
    });
  });

  describe("UPDATE", () => {
    it("extracts assignment fields", () => {
      const result = extractFields("UPDATE SET status = 'active' WHERE name = 'John'");
      expect(result.type).toBe("UPDATE");
      expect(result.assignmentFields).toEqual(["status"]);
    });

    it("extracts multiple assignment fields", () => {
      const result = extractFields("UPDATE SET status = 'active', age = 30 WHERE id = 1");
      expect(result.type).toBe("UPDATE");
      expect(result.assignmentFields).toEqual(["status", "age"]);
    });

    it("extracts nested assignment fields", () => {
      const result = extractFields("UPDATE SET profile.verified = TRUE WHERE id = 1");
      expect(result.type).toBe("UPDATE");
      expect(result.assignmentFields).toEqual(["profile.verified"]);
    });

    it("handles lowercase update set where", () => {
      const result = extractFields("update set name = 'x' where id = 1");
      expect(result.type).toBe("UPDATE");
      expect(result.assignmentFields).toEqual(["name"]);
    });
  });

  describe("DELETE", () => {
    it("returns DELETE type with no fields", () => {
      const result = extractFields("DELETE WHERE status = 'old'");
      expect(result.type).toBe("DELETE");
      expect(result.fields).toBeUndefined();
      expect(result.assignmentFields).toBeUndefined();
    });

    it("handles lowercase delete", () => {
      const result = extractFields("delete where active = FALSE");
      expect(result.type).toBe("DELETE");
    });
  });

  describe("plain filter", () => {
    it("returns no type for plain filter queries", () => {
      const result = extractFields("status = 'active' AND age > 18");
      expect(result.type).toBeUndefined();
      expect(result.fields).toBeUndefined();
    });

    it("does not confuse a filter with an implicit SELECT", () => {
      const result = extractFields("name = 'John'");
      expect(result.type).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("does not match keywords inside quoted strings", () => {
      const result = extractFields("name, age WHERE title = 'SELECT committee'");
      expect(result.type).toBe("SELECT");
      expect(result.fields).toEqual(["name", "age"]);
    });

    it("handles empty query", () => {
      const result = extractFields("");
      expect(result.type).toBeUndefined();
    });

    it("handles UPDATE without SET", () => {
      const result = extractFields("UPDATE WHERE id = 1");
      expect(result.type).toBe("UPDATE");
      expect(result.assignmentFields).toBeUndefined();
    });
  });
});
