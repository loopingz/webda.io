import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Mock } from "@webda/models";
import { generate } from "./generate.js";

class Person {
  @Mock.firstName accessor firstName!: string;
  @Mock.lastName accessor lastName!: string;
  @Mock.email accessor email!: string;
  @Mock.integer({ min: 18, max: 99 }) accessor age!: number;
}

class NoHints {
  accessor firstName!: string;
  accessor email!: string;
  accessor age!: number;
}

@suite("generate")
class GenerateTest {
  @test({ name: "produces `count` instances of the requested class" })
  async count() {
    const people = await generate(Person, { count: 5, seed: 1, mode: "test" });
    expect(people.length).toBe(5);
    for (const p of people) expect(p).toBeInstanceOf(Person);
  }

  @test({ name: "deterministic with the same seed" })
  async deterministic() {
    const a = await generate(Person, { count: 3, seed: 42, mode: "test" });
    const b = await generate(Person, { count: 3, seed: 42, mode: "test" });
    expect(a.map(x => x.email)).toEqual(b.map(x => x.email));
  }

  @test({ name: "applies overrides to every generated record" })
  async overrides() {
    const people = await generate(Person, {
      count: 2,
      seed: 1,
      mode: "test",
      overrides: { lastName: "FIXED" }
    });
    for (const p of people) expect(p.lastName).toBe("FIXED");
  }

  @test({ name: "auto-infers from field name when no @Mock decorator is present" })
  async autoInfer() {
    const records = await generate(NoHints, { count: 1, seed: 1, mode: "test" });
    const r = records[0];
    expect(typeof r.firstName).toBe("string");
    expect(r.firstName.length).toBeGreaterThan(0);
    expect(r.email).toMatch(/@/);
    expect(Number.isInteger(r.age)).toBe(true);
  }

  @test({ name: "strict mode throws on unhinted, unknown fields" })
  async strict() {
    class Mystery {
      accessor weirdField!: { some: "object" };
    }
    await expect(generate(Mystery, { count: 1, mode: "test", strict: true })).rejects.toThrow(/weirdField/);
  }

  @test({ name: "test mode throws when a field uses @Mock.ai" })
  async aiInTestMode() {
    class WithAI {
      @Mock.ai({ prompt: "a short bio" }) accessor bio!: string;
    }
    await expect(generate(WithAI, { count: 1, mode: "test" })).rejects.toThrow(/ai/i);
  }

  @test({ name: "resolves all MockKind variants and non-strict unknown fields" })
  async allKindsAndBranches() {
    class AllKinds {
      @Mock.uuid accessor id!: string;
      @Mock.fullName accessor fullName!: string;
      @Mock.phone accessor phone!: string;
      @Mock.url accessor url!: string;
      @Mock.avatar accessor avatar!: string;
      @Mock.lorem({ paragraphs: 1 }) accessor loremPara!: string;
      @Mock.lorem({ sentences: 2 }) accessor loremSent!: string;
      @Mock.lorem({ words: 4 }) accessor loremWords!: string;
      @Mock.pastDate({ within: "year" }) accessor pastYear!: Date;
      @Mock.pastDate({ within: "month" }) accessor pastMonth!: Date;
      @Mock.pastDate({ within: "week" }) accessor pastWeek!: Date;
      @Mock.pastDate({ within: "day" }) accessor pastDay!: Date;
      @Mock.futureDate({ within: "year" }) accessor futureYear!: Date;
      @Mock.pick(["a", "b"]) accessor picked!: string;
      @Mock({ kind: "boolean" }) accessor flag!: boolean;
      @Mock.custom(ctx => `idx-${ctx.index}`) accessor customField!: string;
      @Mock.ai({ prompt: "bio", maxTokens: 50 }) accessor bio!: string;
      @Mock.count(2) accessor relCount!: unknown;
      @Mock({ kind: "nonexistent" }) accessor unknownKindField!: unknown;
      accessor unknownUnhinted!: { x: number };
    }

    // Missing AI provider in dev mode throws inside aiFn
    await expect(generate(AllKinds, { mode: "dev" })).rejects.toThrow(/no AIProvider/);

    const [row] = await generate(AllKinds, {
      mode: "dev",
      seed: 123,
      ai: { complete: async () => "ai-text" }
    });
    expect(typeof row.id).toBe("string");
    expect(typeof row.fullName).toBe("string");
    expect(typeof row.phone).toBe("string");
    expect(typeof row.url).toBe("string");
    expect(typeof row.avatar).toBe("string");
    expect(typeof row.loremPara).toBe("string");
    expect(typeof row.loremSent).toBe("string");
    expect(typeof row.loremWords).toBe("string");
    expect(row.pastYear).toBeInstanceOf(Date);
    expect(row.futureYear).toBeInstanceOf(Date);
    expect(["a", "b"]).toContain(row.picked);
    expect(typeof row.flag).toBe("boolean");
    expect(row.customField).toBe("idx-0");
    expect(row.bio).toBe("ai-text");
    expect(row.relCount).toBeUndefined();
    expect((row as any).unknownKindField).toBeUndefined();
  }
}
