// Extracts the ```ts blocks of every SKILL.md into a generated app and type-checks them
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Type-check the skill examples against an app that has every package they import
 * @param appDir - generated app, built
 * @param skillsDir - agent/skills folder
 */
export function checkSkills(appDir, skillsDir) {
  const outDir = join(appDir, "skills-check");
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const skill of readdirSync(skillsDir)) {
    const content = readFileSync(join(skillsDir, skill, "SKILL.md"), "utf8");
    const blocks = [...content.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map(match => match[1]);
    blocks.forEach((code, index) => {
      const file = `${skill}-${index + 1}.ts`;
      writeFileSync(join(outDir, file), code);
      files.push(file);
    });
  }
  if (files.length === 0) {
    throw new Error(`No ts example found in ${skillsDir}`);
  }
  writeFileSync(
    join(outDir, "tsconfig.json"),
    JSON.stringify(
      {
        extends: "../tsconfig.json",
        compilerOptions: { noEmit: true, rootDir: "..", types: ["node"] },
        include: [...files, "../.webda/module.d.ts"]
      },
      null,
      2
    )
  );
  const result = spawnSync("pnpm", ["exec", "tsc", "-p", "skills-check/tsconfig.json"], {
    cwd: appDir,
    stdio: "inherit"
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Skill examples do not type-check${result.error ? `: ${result.error.message}` : ""}`);
  }
  console.log(`${files.length} skill example(s) type-check`);
}
