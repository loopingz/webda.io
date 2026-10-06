import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skillsDir = fileURLToPath(new URL("../agent/skills", import.meta.url));
const SKILLS = [
  "webda-configuration",
  "webda-models",
  "webda-operations",
  "webda-services",
  "webda-stores",
  "webda-testing"
];

@suite
class SkillsTest {
  @test
  everySkillExists() {
    for (const skill of SKILLS) {
      assert.ok(readdirSync(skillsDir).includes(skill), `missing ${skill}`);
    }
  }

  @test
  everySkillFollowsTheStructure() {
    for (const skill of readdirSync(skillsDir)) {
      const content = readFileSync(`${skillsDir}/${skill}/SKILL.md`, "utf8");
      assert.match(content, new RegExp(`^---\\nname: ${skill}\\ndescription: Use when .+\\n---\\n`), skill);
      let last = -1;
      for (const section of ["## When to use", "## Pattern", "## Common mistakes", "## Verify", "## Reference"]) {
        const index = content.indexOf(section);
        assert.ok(index > last, `${skill}: "${section}" missing or out of order`);
        last = index;
      }
      assert.match(content, /```(ts|json)\n/, `${skill}: needs at least one ts or json example`);
      assert.match(content.trimEnd(), /Written for Webda 4\.0\.0-beta\.$/, skill);
    }
  }

  @test
  agentsMdListsEverySkill() {
    const agents = readFileSync(fileURLToPath(new URL("../agent/AGENTS.md", import.meta.url)), "utf8");
    for (const skill of readdirSync(skillsDir)) {
      assert.ok(agents.includes(`.agents/skills/${skill}/SKILL.md`), `AGENTS.md does not list ${skill}`);
    }
  }
}
