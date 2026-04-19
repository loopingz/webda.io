import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { makeFaker } from "./faker.js";

@suite("makeFaker")
class MakeFakerTest {
  @test({ name: "same seed → identical sequence of outputs" })
  deterministic() {
    const a = makeFaker(42);
    const b = makeFaker(42);
    const seqA = [a.person.firstName(), a.internet.email(), a.number.int({ min: 0, max: 1000 })];
    const seqB = [b.person.firstName(), b.internet.email(), b.number.int({ min: 0, max: 1000 })];
    expect(seqA).toEqual(seqB);
  }

  @test({ name: "different seeds → different outputs (with overwhelming probability)" })
  seedMatters() {
    const a = makeFaker(1);
    const b = makeFaker(2);
    expect(a.person.firstName()).not.toBe(b.person.firstName());
  }

  @test({ name: "no seed → uses Date.now() and values still valid" })
  noSeed() {
    const f = makeFaker();
    expect(typeof f.person.firstName()).toBe("string");
  }
}
