import { describe, it, expect, vi } from "vitest";
import { parseArgs, printHelp } from "../src/cli";

describe("parseArgs", () => {
  it("parses --key value syntax", () => {
    const args = parseArgs(["node", "cli.ts", "--type", "User", "--file", "src/models.ts"]);
    expect(args.type).toBe("User");
    expect(args.file).toBe("src/models.ts");
  });

  it("parses --key=value syntax", () => {
    const args = parseArgs(["node", "cli.ts", "--type=Config", "--project=./tsconfig.json"]);
    expect(args.type).toBe("Config");
    expect(args.project).toBe("./tsconfig.json");
  });

  it("parses --pretty boolean flag", () => {
    const args = parseArgs(["node", "cli.ts", "--type", "User", "--pretty"]);
    expect(args.type).toBe("User");
    expect(args.pretty).toBe(true);
  });

  it("parses --out option", () => {
    const args = parseArgs(["node", "cli.ts", "--type", "User", "--out", "output.json"]);
    expect(args.out).toBe("output.json");
  });

  it("ignores non-flag arguments", () => {
    const args = parseArgs(["node", "cli.ts", "positional", "--type", "User"]);
    expect(args.type).toBe("User");
  });

  it("returns empty object for no arguments", () => {
    const args = parseArgs(["node", "cli.ts"]);
    expect(args.type).toBeUndefined();
    expect(args.file).toBeUndefined();
    expect(args.project).toBeUndefined();
    expect(args.out).toBeUndefined();
    expect(args.pretty).toBeUndefined();
  });

  it("handles flag at end without value", () => {
    const args = parseArgs(["node", "cli.ts", "--type"]);
    expect(args.type).toBeUndefined();
  });

  it("handles flag followed by another flag (no value)", () => {
    const args = parseArgs(["node", "cli.ts", "--type", "--pretty"]);
    expect(args.type).toBeUndefined();
    expect(args.pretty).toBe(true);
  });
});

describe("printHelp", () => {
  it("prints help text to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printHelp();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("schema-gen");
    expect(spy.mock.calls[0][0]).toContain("--type");
    spy.mockRestore();
  });
});
