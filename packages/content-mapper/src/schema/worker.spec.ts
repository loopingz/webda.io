import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { emitProject, formatGeneratedDiagnostic, handle, main } from "./worker.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "..", "test", "fixture");
const schemaFixture = join(here, "..", "..", "test", "schema-fixture");

describe("emitProject", () => {
  it("reports declaration emit errors and does not write partial output", () => {
    const project = mkdtempSync(join(tmpdir(), "webda-emit-error-"));
    try {
      writeFileSync(
        join(project, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { declaration: true, outDir: "lib", types: [] }, include: ["index.ts"] })
      );
      writeFileSync(join(project, "index.ts"), "export const create = () => class { private value = 1; };\n");
      const report = emitProject(join(project, "tsconfig.json"), project);
      expect(report.diagnosticCount).toBeGreaterThan(0);
      expect(report.diagnostics).toContain("private");
      expect(report.written).toBe(0);
      expect(existsSync(join(project, "lib"))).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

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

describe("worker handle and main", () => {
  it("writes emitted files when diagnosticCount is zero", () => {
    const project = mkdtempSync(join(tmpdir(), "webda-emit-ok-"));
    try {
      writeFileSync(
        join(project, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { outDir: "lib", types: [] }, include: ["index.ts"] })
      );
      writeFileSync(join(project, "index.ts"), "export const answer = 42;\n");
      const report = emitProject(join(project, "tsconfig.json"), project);
      expect(report.diagnosticCount).toBe(0);
      expect(report.written).toBeGreaterThan(0);
      expect(existsSync(join(project, "lib", "index.js"))).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("handles topLevel, emit, model and service requests (including missing/failing services) and main()", async () => {
    const res = handle({
      project: schemaFixture,
      requests: [
        { id: "top", kind: "topLevel", namespace: "Test" },
        { id: "emit", kind: "emit" },
        { id: "model", kind: "model", file: join(schemaFixture, "src", "dto.model.ts"), className: "Invoice" },
        {
          id: "serviceOk",
          kind: "service",
          file: join(schemaFixture, "src", "params.service.ts"),
          className: "BroadService"
        },
        {
          id: "serviceNoParams",
          kind: "service",
          file: join(schemaFixture, "src", "dto.model.ts"),
          className: "Invoice"
        },
        {
          id: "serviceRefused",
          kind: "service",
          file: join(schemaFixture, "src", "exotic.service.ts"),
          className: "TemplateService"
        }
      ]
    });
    expect(res.results.top).toBeDefined();
    expect(res.results.emit).toBeDefined();
    expect(res.results.model).toBeDefined();
    expect(res.results.serviceOk).toBeDefined();
    expect(res.errors.serviceNoParams).toContain("no parameters type found on Invoice");
    expect(res.errors.serviceRefused).toContain("no JSON Schema form");

    // Test main() reading from stdin and writing to stdout
    const origStdin = Object.getOwnPropertyDescriptor(process, "stdin");
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const payload = JSON.stringify({
        project: schemaFixture,
        requests: [{ id: "m", kind: "model", file: join(schemaFixture, "src", "dto.model.ts"), className: "Receipt" }]
      });
      Object.defineProperty(process, "stdin", {
        value: Readable.from([Buffer.from(payload)]),
        configurable: true
      });
      await main();
      expect(writeSpy).toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
      if (origStdin) Object.defineProperty(process, "stdin", origStdin);
    }
  });
});
