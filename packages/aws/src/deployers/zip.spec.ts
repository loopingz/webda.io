import { describe, expect, it } from "vitest";
import { crc32 as coreCrc32, writeZip as coreWriteZip } from "@webda/core";
import { crc32, writeZip } from "./zip.js";

describe("AWS ZIP compatibility", () => {
  it("reexports the shared writer and checksum", () => {
    expect(writeZip).toBe(coreWriteZip);
    expect(crc32).toBe(coreCrc32);
  });
});
