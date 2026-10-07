import { describe, expect, it } from "vitest";
import { webdaContentMapper } from "./vite.ts";

describe("webdaContentMapper", () => {
  it("skips non-matching files without starting a session", () => {
    const plugin: any = webdaContentMapper();
    plugin.configResolved({ root: process.cwd() });
    expect(plugin.transform("export const a = 1;", "/x/node_modules/y/index.ts")).toBeUndefined();
    expect(plugin.transform("export const a = 1;", "/x/types.d.ts")).toBeUndefined();
    expect(plugin.transform("body{}", "/x/a.css")).toBeUndefined();
  });
});
