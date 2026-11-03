import { describe, expect, it } from "vitest";
import { findTextSectionFileOffset } from "./patch-tsc.ts";

describe("findTextSectionFileOffset", () => {
  it("reads null-terminated Mach-O section names within their fixed-width field", () => {
    const binary = Buffer.alloc(32 + 72 + 2 * 80);
    binary.writeUInt32LE(0xfeedfacf, 0);
    binary.writeUInt32LE(1, 16);
    binary.writeUInt32LE(0x19, 32);
    binary.writeUInt32LE(72 + 2 * 80, 36);
    binary.writeUInt32LE(2, 32 + 64);
    binary.write("__not_text", 104);
    binary.write("__text\0padding", 184);
    binary.writeUInt32LE(4096, 184 + 48);
    expect(findTextSectionFileOffset(binary)).toBe(4096);
  });

  it("reads null-terminated PE section names within their fixed-width field", () => {
    const binary = Buffer.alloc(64 + 24 + 2 * 40);
    binary.writeUInt16LE(0x5a4d, 0);
    binary.writeUInt32LE(64, 0x3c);
    binary.writeUInt32LE(0x00004550, 64);
    binary.writeUInt16LE(2, 70);
    binary.write(".data", 88);
    binary.write(".text\0xx", 128);
    binary.writeUInt32LE(512, 128 + 20);
    expect(findTextSectionFileOffset(binary)).toBe(512);
  });
});
