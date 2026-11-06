/**
 * Helpers for the flow specs: run the generators over the flows fixture, with some files replaced in memory.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openSession, type Session } from "../src/context.ts";
import { applyEdits, mergePlan, type FileEdits, type Generator } from "../src/plan.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** Root of the flows fixture project. */
export const FLOWS_FIXTURE = join(here, "flows-fixture");

/** Source root of the flows fixture. */
export const FLOWS_SRC = join(FLOWS_FIXTURE, "src");

/**
 * Path of a fixture source file
 * @param name - file name under `src/`
 * @returns the absolute path, with "/" separators
 */
export function fixtureFile(name: string): string {
  return join(FLOWS_SRC, name).replace(/\\/g, "/");
}

/**
 * Open a session over the fixture, with files replaced in memory
 * @param overrides - text per absolute file name
 * @returns the session
 */
export function openFixture(overrides: Record<string, string> = {}): Session {
  return openSession(join(FLOWS_FIXTURE, "tsconfig.json"), FLOWS_SRC, {
    readFile: (fileName: string) => overrides[fileName.replace(/\\/g, "/")]
  });
}

/**
 * Run generators over the fixture, then type-check the mapped program
 * @param generators - the generators
 * @param overrides - text per absolute file name
 * @returns the produced edits, the mapped text per file and the semantic diagnostics per file
 */
export function mapFixture(
  generators: Generator[],
  overrides: Record<string, string> = {}
): { produced: FileEdits[]; mapped: Record<string, string>; diagnostics: (fileName: string) => any[] } {
  const session = openFixture(overrides);
  const produced: FileEdits[] = [];
  const mapped: Record<string, string> = {};
  try {
    for (const generator of generators) produced.push(...generator.analyze(session.ctx));
    const { plan } = mergePlan(produced);
    for (const sf of session.ctx.sourceFiles) {
      mapped[sf.fileName] = applyEdits(sf.text, plan.get(sf.fileName) ?? []);
    }
  } finally {
    session.dispose();
  }
  const checked = openFixture({ ...overrides, ...mapped });
  const diagnostics: Record<string, any[]> = {};
  try {
    for (const fileName of Object.keys(mapped)) {
      diagnostics[fileName] = [...checked.ctx.program.getSemanticDiagnostics(fileName as any)];
    }
  } finally {
    checked.dispose();
  }
  return { produced, mapped, diagnostics: fileName => diagnostics[fileName] ?? [] };
}
