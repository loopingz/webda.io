import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emitProject, formatGeneratedDiagnostic } from "./worker.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "..", "test", "fixture");

describe("emitProject", () => {
  it("logs the generator warnings without failing the build", () => {
    const report = emitProject(join(fixture, "tsconfig.json"), join(fixture, "src"), {
      storageModule: "./runtime.js",
      qlModule: "./runtime.js"
    });
    expect(report.diagnosticCount).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings.every(line => /^src\/sealed\.model\.ts\(\d+,\d+\): warning WQL9004: /.test(line))).toBe(
      true
    );
    // Errors of the generators are not part of the warnings
    expect(report.warnings.some(line => line.includes("Unknown attribute"))).toBe(false);
  });
});

describe("formatGeneratedDiagnostic", () => {
  it("prints the line and column of the authored file, as tsc does", () => {
    const fileName = join(fixture, "src", "query.service.ts");
    const line = formatGeneratedDiagnostic(
      { fileName, start: 10, length: 1, code: 9001, messageText: "Unknown attribute 'x'" },
      fixture
    );
    expect(line).toBe("src/query.service.ts(1,11): error WQL9001: Unknown attribute 'x'");
  });

  it("reports a file it cannot read at its first line", () => {
    const line = formatGeneratedDiagnostic(
      {
        fileName: join(fixture, "src", "missing.ts"),
        start: 5,
        length: 1,
        code: 9004,
        messageText: "m",
        severity: "warning"
      },
      fixture
    );
    expect(line).toBe("src/missing.ts(1,6): warning WQL9004: m");
  });
});
