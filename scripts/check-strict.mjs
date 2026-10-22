import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const packages = new URL("../packages/", import.meta.url);
const strictFlags = [
  "noImplicitAny",
  "noImplicitThis",
  "alwaysStrict",
  "strictBindCallApply",
  "strictFunctionTypes",
  "strictNullChecks",
  "strictBuiltinIteratorReturn",
  "useUnknownInCatchVariables"
];
let checked = 0;
for (const entry of await readdir(packages, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const config = new URL(`${entry.name}/tsconfig.json`, packages);
  let source;
  try {
    source = await readFile(config, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  const { compilerOptions = {} } = JSON.parse(source);
  const disabled = strictFlags.filter(flag => compilerOptions[flag] === false);
  if (compilerOptions.strict !== true || disabled.length) {
    console.error(
      `${fileURLToPath(config)} must enable strict mode without disabling ${disabled.join(", ") || "strict checks"}`
    );
    process.exitCode = 1;
  }
  checked++;
}
if (!process.exitCode) console.log(`Strict mode enabled in all ${checked} package configurations.`);
