import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

export function writer(fileName: string, text: string) {
  mkdirSync(dirname(fileName), { recursive: true });
  // Add the ".js" -> if module
  writeFileSync(
    fileName,
    text
      .replace(/^(import .* from "\..*?)(\.js)?";$/gm, '$1.js";')
      .replace(/^(import .* from '\..*?)(\.js)?';$/gm, '$1.js\';')
      .replace(/^(import .* from "(@[^/]+\/)?[^@/]+\/.*?)(\.js)?";$/gm, '$1.js";')
      .replace(/^(import .* from '(@[^/]+\/)?[^@/]+\/.*?)(\.js)?';$/gm, '$1.js\';')
      .replace(/^(export .* from "\..*?)(\.js)?";$/gm, '$1.js";')
      .replace(/^(export .* from '\..*?)(\.js)?';$/gm, '$1.js\';')
  );
}
