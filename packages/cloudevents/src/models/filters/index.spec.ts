import { expect, test } from "@jest/globals";
import { CloudEvent } from "cloudevents";
import { FiltersHelper } from ".";

test("PrefixFilter", () => {
  const event = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });

  expect(
    FiltersHelper.get({
      prefix: {
        type: "com.test"
      }
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      prefix: {
        type: "test"
      }
    }).match(event)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      prefix: {
        source: "unit-"
      }
    }).match(event)
  ).toBe(true);
});

test("SuffixFilter", () => {
  const event = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });

  expect(
    FiltersHelper.get({
      suffix: {
        type: "com.test"
      }
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      suffix: {
        type: "com."
      }
    }).match(event)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      suffix: {
        source: "-test"
      }
    }).match(event)
  ).toBe(true);
});

test("ExactFilter", () => {
  const event = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });

  expect(
    FiltersHelper.get({
      exact: {
        type: "com.test"
      }
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      exact: {
        type: "com."
      }
    }).match(event)
  ).toBe(false);

  expect(
    FiltersHelper.get({
      exact: {
        source: "-test"
      }
    }).match(event)
  ).toBe(false);
});

test("AllFilter", () => {
  const event = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });

  expect(
    FiltersHelper.get({
      all: [
        {
          suffix: {
            type: "com.test"
          }
        },
        {
          exact: {
            source: "unit-test"
          }
        }
      ]
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      all: [
        {
          suffix: {
            type: "com2.test"
          }
        },
        {
          exact: {
            source: "unit-test"
          }
        }
      ]
    }).match(event)
  ).toBe(false);
});

test("AnyFilter", () => {
  const event = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });

  expect(
    FiltersHelper.get({
      any: [
        {
          suffix: {
            type: "com.test"
          }
        },
        {
          exact: {
            source: "unit-test"
          }
        }
      ]
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      any: [
        {
          suffix: {
            type: "com2.test"
          }
        },
        {
          exact: {
            source: "unit-test"
          }
        }
      ]
    }).match(event)
  ).toBe(true);

  expect(
    FiltersHelper.get({
      any: [
        {
          suffix: {
            type: "com2.test"
          }
        },
        {
          exact: {
            source: "unittest"
          }
        }
      ]
    }).match(event)
  ).toBe(false);
});

test("Common errors", () => {
  const event = new CloudEvent({ type: "com.test", source: "unit-test", data: {} });

  expect(() =>
    FiltersHelper.get({
      unknown: {
        type: "com.test"
      }
    }).match(event)
  ).toThrow(/Unsupported filter type 'unknown'/);

  expect(() =>
    FiltersHelper.get({
      prefix: {
        type: "com.test",
        source: "unit-test"
      }
    }).match(event)
  ).toThrow(/Filter only accept one property filtering/);

  expect(
    FiltersHelper.get({
      suffix: {
        type2: "com2.test"
      }
    }).match(event)
  ).toBe(false);
});
