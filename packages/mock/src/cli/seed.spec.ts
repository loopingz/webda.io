import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { parseSeedArgs } from "./seed.js";

@suite("parseSeedArgs")
class ParseSeedArgsTest {
  @test({ name: "parses --Model N repeated flags into a spec map" })
  flags() {
    const { spec, options } = parseSeedArgs(["--User", "10", "--Task", "50"]);
    expect(spec).toEqual({ User: 10, Task: 50 });
    expect(options.seed).toBeUndefined();
  }

  @test({ name: "parses --seed N and --mode dev|demo" })
  seedMode() {
    const { options } = parseSeedArgs(["--seed", "42", "--mode", "demo"]);
    expect(options.seed).toBe(42);
    expect(options.mode).toBe("demo");
  }

  @test({ name: "--no-ai overrides default" })
  noAi() {
    const { options } = parseSeedArgs(["--no-ai"]);
    expect(options.disableAi).toBe(true);
  }

  @test({ name: "--spec ./seed.json is picked up as a separate path" })
  specFile() {
    const { specPath } = parseSeedArgs(["--spec", "./seed.json"]);
    expect(specPath).toBe("./seed.json");
  }
}
