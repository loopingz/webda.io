// Copies the stylesheets next to the compiled output so that `lib/` is self-contained.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "lib", "styles"), { recursive: true });
cpSync(join(root, "src", "styles"), join(root, "lib", "styles"), { recursive: true });
