import { suite, test } from "@webda/test";
import * as assert from "assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [/["']@webda\/core/, /["']@webda\/models/, /["']@webda\/workout/, /["'][./]*\/server\//, /["']node:/];

/**
 * List the non-spec TypeScript files of a folder, recursively
 * @param dir - the folder
 * @returns the file paths
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") && !path.endsWith("conformance.ts") ? [path] : [];
  });
}

@suite
class BoundariesTest {
  @test
  clientAndProtocolStayIsomorphic() {
    for (const file of [...sources("src/client"), ...sources("src/protocol")]) {
      const imports = readFileSync(file, "utf8")
        .split("\n")
        .filter(line => /^\s*(import|export)\b.*from\s/.test(line));
      for (const line of imports) {
        assert.ok(!FORBIDDEN.some(re => re.test(line)), `${file} must not import: ${line.trim()}`);
      }
    }
  }
}
