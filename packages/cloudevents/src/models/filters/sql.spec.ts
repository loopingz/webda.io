import { expect, test } from "@jest/globals";
import { CloudEvent } from "cloudevents";
import { FiltersHelper } from ".";
import { SqlFilterImplementation } from "./sql";

const event: CloudEvent<any> = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });
const event2: CloudEvent<any> = new CloudEvent({
  type: "com.test",
  subject: "plop",
  source: "unit-test",
  custom1: " Plop ",
  data: {}
});

test("SQLFilter", () => {
  expect(
    FiltersHelper.get({
      sql: "EXISTS subject"
    }).match(event)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "EXISTS subject"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject = "plop"`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject = "plopi"`
    }).match(event2)
  ).toBe(false);
});

test("SQLFilter Sets", () => {
  expect(
    FiltersHelper.get({
      sql: `subject IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject NOT IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `NOT subject IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `NOT subject NOT IN ("plopi", "plop")`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject IN ("plopi", "plopa")`
    }).match(event2)
  ).toBe(false);
});

test("SQLFilter Arithmetic", () => {
  expect(
    FiltersHelper.get({
      sql: "1 + 2 > 1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 + 2 > 3"
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "1 + 2 < 1"
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "1 / 2 < 1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "(1 - 1) * 2 < 1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 * 2 >= -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 2 = -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 2 <= -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 3 <= -1"
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: "1 - 1 <= -1"
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: "10 % 3 = 1"
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter Logic Expression", () => {
  expect(
    FiltersHelper.get({
      sql: `subject = "plop" AND FALSE`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `TRUE XOR TRUE`
    }).match(event2)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      sql: `subject = "plop" XOR FALSE`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject != "plop" XOR TRUE`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject != "plop" OR TRUE`
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter functions", () => {
  expect(
    FiltersHelper.get({
      sql: `UPPER(subject) = 'PLOP'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `LENGTH(subject) = 4`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `UPPER(LEFT(subject, 2)) = 'PL'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `UPPER(RIGHT(subject, 2)) = 'OP'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `ABS(-1) = 1`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `LOWER(custom1) = ' plop '`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `LOWER(custom1) = ''`
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `SUBSTRING(custom1, 1) = 'Plop '`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `SUBSTRING(TRIM(custom1), 0, 2) = 'Pl'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `CONCAT("Hello", "World") = 'HelloWorld'`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `CONCAT_WS(" ", "Hello", "World") = 'Hello World'`
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter converters", () => {
  expect(
    FiltersHelper.get({
      sql: `BOOL('true')`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `TRUE`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL('True')`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL('true2')`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `IS_BOOL(BOOL(TRUE))`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL(TRUE)`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `BOOL(12)`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `IS_INT(12)`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `IS_INT('plop')`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `STRING('plop') = 'plop'`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `STRING(122) = '122'`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `STRING(TRUE) = 'TRUE'`
    }).match(event2)
  ).toBe(true);
  // INT now
  expect(
    FiltersHelper.get({
      sql: `INT('plop') = 0`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `INT('122') = 122`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `INT(122) = 122`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `INT(TRUE) = 0`
    }).match(event2)
  ).toBe(true);
});

test("SQLFilter Like", () => {
  expect(
    FiltersHelper.get({
      sql: `subject LIKE "p%p"`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `subject LIKE "pl_p"`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `subject LIKE "p_p"`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `"te{plop}st" LIKE "te{plop}_t"`
    }).match(event2)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      sql: `subject NOT LIKE "p%p"`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `subject NOT LIKE "pl_p"`
    }).match(event2)
  ).toBe(false);
  expect(
    FiltersHelper.get({
      sql: `subject NOT LIKE "p_p"`
    }).match(event2)
  ).toBe(true);
  expect(
    FiltersHelper.get({
      sql: `"te{plop}st" NOT LIKE "te{plop}_t"`
    }).match(event2)
  ).toBe(false);
});

test("SQLFilter errors", () => {
  expect(() =>
    FiltersHelper.get({
      sql: `PLOP(-1) = 1`
    }).match(event)
  ).toThrow(/Unknown function: 'PLOP'/);

  // One argument methods
  ["TRIM", "LENGTH", "UPPER", "ABS", "LOWER", "BOOL", "INT", "STRING", "IS_INT", "IS_BOOL"].forEach(method => {
    expect(() =>
      FiltersHelper.get({
        sql: `${method}("plop", "test")`
      }).match(event)
    ).toThrow(/Too many arguments/);
  });
  // Two arguments methods
  ["LEFT", "RIGHT"].forEach(method => {
    expect(() =>
      FiltersHelper.get({
        sql: `${method}("plop", "test", 3)`
      }).match(event)
    ).toThrow(/Wrong arguments count/);
  });

  expect(() =>
    FiltersHelper.get({
      sql: `SUBSTRING("plop", 0, 3, 4)`
    }).match(event)
  ).toThrow(/Wrong arguments count/);

  expect(() =>
    FiltersHelper.get({
      sql: `SUBSTRING("plop")`
    }).match(event)
  ).toThrow(/Wrong arguments count/);
});

test("SQLFilter optimization", () => {
  expect(FiltersHelper.get({ sql: "RIGHT(topic, 4) = 'plop'" }).definition).toStrictEqual({
    suffix: {
      topic: "plop"
    }
  });
  expect(FiltersHelper.get({ sql: "LEFT(subject, 10) = 'cloudevent'" }).definition).toStrictEqual({
    prefix: {
      subject: "cloudevent"
    }
  });
});

test("SQLFilter COV", () => {
  // SQL should be optimized and compute when it can be
  expect(new SqlFilterImplementation({ sql: '"TEST" = TRUE OR 1 > 3' }).query.toString()).toBe("FALSE");
  expect(new SqlFilterImplementation({ sql: "1 <= 3" }).query.toString()).toBe("TRUE");
  expect(new SqlFilterImplementation({ sql: 'subject = "TEST" OR topic > 3 OR sub = TRUE' }).query.toString()).toBe(
    'subject = "TEST" OR topic > 3 OR sub = TRUE'
  );
  expect(new SqlFilterImplementation({ sql: "subject + 3 = 4 OR topic * 3 > 3" }).query.toString()).toBe(
    "subject + 3 = 4 OR topic * 3 > 3"
  );
  expect(new SqlFilterImplementation({ sql: 'subject NOT IN ["TEST", "TEST2"]' }).query.toString()).toBe(
    'subject NOT IN ("TEST","TEST2")'
  );
  expect(new SqlFilterImplementation({ sql: 'subject IN [topic, "TEST2"]' }).query.toString()).toBe(
    'subject IN (topic,"TEST2")'
  );
  expect(new SqlFilterImplementation({ sql: 'UPPER(subject) LIKE "W?BDA"' }).query.toString()).toBe(
    'UPPER(subject) LIKE "W?BDA"'
  );

  expect(new SqlFilterImplementation({ sql: 'NOT (UPPER(subject) LIKE "W?BDA")' }).query.toString()).toBe(
    'NOT UPPER(subject) LIKE "W?BDA"'
  );
  expect(new SqlFilterImplementation({ sql: "EXISTS plop" }).query.toString()).toBe("EXISTS plop");
  expect(new SqlFilterImplementation({ sql: "-subject" }).query.toString()).toBe("-subject");
});
