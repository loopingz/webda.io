import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { chooseStrategy } from "./strategy.js";

@suite("chooseStrategy")
class ChooseStrategyTest {
  @test({ name: "returns 'replace' for single-line strings" })
  returnsReplaceForSingleLineStrings() {
    expect(chooseStrategy("/title", "hello world", {})).toBe("replace");
  }

  @test({ name: "returns 'line' for strings with newlines" })
  returnsLineForStringsWithNewlines() {
    expect(chooseStrategy("/body", "line 1\nline 2", {})).toBe("line");
  }

  @test({ name: "honors explicit per-path override, even for single-line values" })
  honorsExplicitPerPathOverrideEvenForSingleLineValues() {
    expect(chooseStrategy("/title", "hello", { stringStrategy: { "/title": "line" } })).toBe("line");
  }

  @test({ name: "honors explicit 'replace' override even for multiline values" })
  honorsExplicitReplaceOverrideEvenForMultilineValues() {
    expect(chooseStrategy("/body", "a\nb", { stringStrategy: { "/body": "replace" } })).toBe("replace");
  }

  @test({ name: "multilineThreshold gates 'line' when configured" })
  multilineThresholdGatesLineWhenConfigured() {
    // Short multiline string → replace when threshold exceeds length.
    expect(chooseStrategy("/body", "a\nb", { multilineThreshold: 100 })).toBe("replace");
    // Long multiline string → line.
    const long = "a\n" + "x".repeat(200);
    expect(chooseStrategy("/body", long, { multilineThreshold: 100 })).toBe("line");
  }

  @test({ name: "multilineThreshold boundary: value.length === threshold → 'line'" })
  multilineThresholdBoundaryValueLengthEqualsThreshold() {
    // Strategy uses `length < threshold` to pick replace — at-boundary values get 'line'.
    const atBoundary = "a\nb"; // length 3
    expect(chooseStrategy("/body", atBoundary, { multilineThreshold: 3 })).toBe("line");
    expect(chooseStrategy("/body", atBoundary, { multilineThreshold: 4 })).toBe("replace");
  }

  @test({ name: "returns 'replace' for empty string" })
  returnsReplaceForEmptyString() {
    expect(chooseStrategy("/empty", "", {})).toBe("replace");
  }
}
