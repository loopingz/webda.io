import { suite, test } from "@webda/test";
import { getPlural } from "./plural";
import * as assert from "assert";

@suite
class MetadataSuite {
  @test
  plurals() {
    const plurals = [
      ["cat", "cats"],
      ["dog", "dogs"],
      ["baby", "babies"],
      ["box", "boxes"],
      ["bus", "buses"],
      ["wish", "wishes"],
      ["lunch", "lunches"],
      ["wife", "wives"],
      ["shelf", "shelves"],
      ["city", "cities"],
      ["ray", "rays"],
      ["boy", "boys"],
      ["essay", "essays"],
      ["potato", "potatoes"],
      ["tomato", "tomatoes"],
      ["lady", "ladies"],
      ["leaf", "leaves"],
      ["life", "lives"],
      ["elf", "elves"],
      ["loaf", "loaves"],
      ["thief", "thieves"],
      ["self", "selves"],
      ["calf", "calves"],
      ["scarf", "scarves"],
      ["half", "halves"],
      ["knife", "knives"],
      ["wolf", "wolves"]
    ];
    for (const [singular, plural] of plurals) {
      assert.strictEqual(getPlural(singular), plural);
    }
  }
}
