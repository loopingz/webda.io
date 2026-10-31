import { WebdaError } from "@webda/core";
import type { ColumnType } from "@webda/sql-schema";
import { describe, expect, it } from "vitest";
import { sqlString } from "../dialect.js";
import { SQLColumnComparisonExpression, columnLiteral, isTimeValue, valueMatchesType } from "./comparison.js";
import type { RelationalDialect } from "./dialect.js";

/** The fragments the comparison needs */
const dialect = {
  quote: (id: string) => `"${id}"`,
  castText: (e: string) => `CAST(${e} AS TEXT)`,
  distinctFrom: (l: string, r: string) => `${l} IS DISTINCT FROM ${r}`,
  like: (t: string, p: string) => `${t} LIKE ${sqlString(p)}`,
  timeText: (e: string, type: ColumnType) => `ISO(${e}, ${type.kind})`
} as unknown as RelationalDialect;

const text: ColumnType = { kind: "text" };
const bigint: ColumnType = { kind: "bigint" };
const boolean: ColumnType = { kind: "boolean" };
const timestamptz: ColumnType = { kind: "timestamptz" };

const render = (operator: any, column: string, value: any, type: ColumnType) =>
  new SQLColumnComparisonExpression(operator, column, value, type, dialect).toString();

describe("SQLColumnComparisonExpression", () => {
  it("rendersTypedLiterals", () => {
    expect(render("=", '"n"', 5, bigint)).toBe('"n" = 5');
    expect(render("=", '"s"', "it's", text)).toBe(`"s" = 'it''s'`);
    expect(render("=", '"b"', true, boolean)).toBe('"b" = TRUE');
    expect(render(">", '"d"', new Date("2024-01-02T03:04:05.000Z"), timestamptz)).toBe(
      `"d" > '2024-01-02T03:04:05.000Z'`
    );
    expect(render(">=", '"d"', "2024-01-02", timestamptz)).toBe(`"d" >= '2024-01-02'`);
    expect(render("!=", '"n"', 5, bigint)).toBe('"n" IS DISTINCT FROM 5');
  });

  it("mismatchedEqualityComparesText", () => {
    expect(render("=", '"n"', "abc", bigint)).toBe(`CAST("n" AS TEXT) = 'abc'`);
    expect(render("!=", '"n"', "1", bigint)).toBe(`CAST("n" AS TEXT) IS DISTINCT FROM '1'`);
    expect(render("=", '"s"', 1, text)).toBe(`"s" = '1'`);
    expect(render("=", '"b"', "true", boolean)).toBe(`CAST("b" AS TEXT) = 'true'`);
  });

  it("mismatchedOrderingIsFalse", () => {
    expect(render("<", '"n"', "abc", bigint)).toBe("FALSE");
    expect(render(">=", '"s"', 3, text)).toBe("FALSE");
  });

  it("timeColumnsCompareDatesNativelyAndOtherTextAsIso", () => {
    const date: ColumnType = { kind: "date" };
    expect(render("=", '"d"', "2024-01-02", date)).toBe(`"d" = '2024-01-02'`);
    expect(render("<", '"d"', "2024-01-02T03:04:05Z", timestamptz)).toBe(`"d" < '2024-01-02T03:04:05Z'`);
    // A text that is no date matches nothing (never a cast error), `!=` matches everything
    expect(render("=", '"d"', "abc", timestamptz)).toBe(`ISO("d", timestamptz) = 'abc'`);
    expect(render("!=", '"d"', "abc", timestamptz)).toBe(`ISO("d", timestamptz) IS DISTINCT FROM 'abc'`);
    expect(render("<", '"d"', "abc", timestamptz)).toBe("FALSE");
    expect(render(">", '"d"', "2024-13-45", date)).toBe("FALSE");
    expect(render("=", '"d"', 20240102, date)).toBe(`ISO("d", date) = '20240102'`);
    expect(render("LIKE", '"d"', "2024-01%", timestamptz)).toBe(`ISO("d", timestamptz) LIKE '2024-01%'`);
  });

  it("likeCastsNonText", () => {
    expect(render("LIKE", '"n"', "1%", bigint)).toBe(`CAST("n" AS TEXT) LIKE '1%'`);
    expect(render("LIKE", '"s"', "a%", text)).toBe(`"s" LIKE 'a%'`);
    expect(render("LIKE", '"s"', "a%", { kind: "varchar", length: 10 })).toBe(`"s" LIKE 'a%'`);
  });

  it("unaryAndContains", () => {
    expect(render("IS NULL", '"s"', undefined, text)).toBe('"s" IS NULL');
    expect(render("IS NOT NULL", '"s"', undefined, text)).toBe('"s" IS NOT NULL');
    expect(() => render("CONTAINS", '"s"', "x", text)).toThrow(WebdaError.BadRequest);
  });

  it("helpersClassifyValues", () => {
    expect(valueMatchesType("x", { kind: "uuid" })).toBe(true);
    expect(valueMatchesType(new Date(), { kind: "date" })).toBe(true);
    expect(valueMatchesType("x", { kind: "date" })).toBe(false);
    expect(isTimeValue(new Date("nope"))).toBe(false);
    expect(isTimeValue("2024-99-99")).toBe(false);
    expect(isTimeValue("2024-02-28 10:00")).toBe(true);
    expect(isTimeValue(1)).toBe(false);
    expect(valueMatchesType(1.5, { kind: "decimal" })).toBe(true);
    expect(valueMatchesType(1, text)).toBe(false);
    expect(valueMatchesType(null, text)).toBe(false);
    expect(columnLiteral(2.5, { kind: "double" })).toBe("2.5");
    expect(columnLiteral(false, boolean)).toBe("FALSE");
    expect(columnLiteral("a'b", { kind: "varchar", length: 3 })).toBe("'a''b'");
  });
});
