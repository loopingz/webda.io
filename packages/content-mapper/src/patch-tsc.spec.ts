import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findGoFunctionFileOffset,
  findTextSectionFileOffset,
  findTscBinary,
  HAS_RESERVED_EXTENSION_SYMBOL,
  IS_PACKAGE_ALLOWED_SYMBOL,
  patchTsc
} from "./patch-tsc.ts";

vi.mock("node:child_process", async original => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: vi.fn()
}));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    readFileSync: vi.fn(fs.readFileSync),
    statSync: vi.fn(fs.statSync),
    writeFileSync: vi.fn(fs.writeFileSync),
    renameSync: vi.fn(fs.renameSync),
    rmSync: vi.fn(fs.rmSync)
  };
});
vi.mock("node:module", async original => {
  const mod = await original<typeof import("node:module")>();
  return { ...mod, createRequire: vi.fn(mod.createRequire) };
});

afterEach(() => vi.restoreAllMocks());

/** A minimal ELF executable with two Go functions and recognizable code bytes. */
function executable(): Buffer {
  const binary = Buffer.alloc(2048);
  binary.writeUInt32BE(0x7f454c46, 0);
  binary[4] = 2;
  binary.writeBigUInt64LE(64n, 40);
  binary.writeUInt16LE(64, 58);
  binary.writeUInt16LE(3, 60);
  binary.writeUInt16LE(2, 62);
  binary.writeUInt32LE(1, 128);
  binary.writeBigUInt64LE(512n, 128 + 24);
  binary.writeBigUInt64LE(320n, 192 + 24);
  binary.write("\0.text\0", 320);
  binary.fill(0xcc, 512, 576);
  binary.writeUInt32LE(0xfffffff1, 1024);
  binary[1030] = 1;
  binary[1031] = 8;
  binary.writeBigUInt64LE(2n, 1032);
  binary.writeBigUInt64LE(72n, 1056);
  binary.writeBigUInt64LE(512n, 1088);
  binary.write(`${HAS_RESERVED_EXTENSION_SYMBOL}\0${IS_PACKAGE_ALLOWED_SYMBOL}\0`, 1096);
  binary.writeUInt32LE(16, 1536);
  binary.writeUInt32LE(32, 1540);
  binary.writeUInt32LE(32, 1544);
  binary.writeUInt32LE(48, 1548);
  binary.writeInt32LE(0, 1572);
  binary.writeInt32LE(HAS_RESERVED_EXTENSION_SYMBOL.length + 1, 1588);
  return binary;
}

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

  it("reads ELF text offsets and rejects executables without a text section", () => {
    const elf = executable();
    expect(findTextSectionFileOffset(elf)).toBe(512);
    elf.write(".data", 321);
    expect(() => findTextSectionFileOffset(elf)).toThrow("Could not find .text section in ELF");
    const macho = Buffer.alloc(112);
    macho.writeUInt32LE(0xfeedfacf, 0);
    macho.writeUInt32LE(2, 16);
    macho.writeUInt32LE(8, 36);
    macho.writeUInt32LE(0x19, 40);
    macho.writeUInt32LE(72, 44);
    expect(() => findTextSectionFileOffset(macho)).toThrow("Could not find __text section in Mach-O");
    const pe = Buffer.alloc(88);
    pe.writeUInt16LE(0x5a4d, 0);
    pe.writeUInt32LE(64, 0x3c);
    expect(() => findTextSectionFileOffset(pe)).toThrow("Invalid PE signature");
    pe.writeUInt32LE(0x00004550, 64);
    expect(() => findTextSectionFileOffset(pe)).toThrow("Could not find .text section in PE");
    expect(() => findTextSectionFileOffset(Buffer.alloc(0))).toThrow("Unsupported executable format");
    expect(() => findTextSectionFileOffset(Buffer.alloc(64))).toThrow("Unsupported executable format");
  });
});

describe("Go symbol lookup", () => {
  it.each([1, 2, 4])("locates both functions with instruction size %i", minLC => {
    const binary = executable();
    binary[1030] = minLC;
    expect(findGoFunctionFileOffset(binary, HAS_RESERVED_EXTENSION_SYMBOL)).toBe(528);
    expect(findGoFunctionFileOffset(binary, IS_PACKAGE_ALLOWED_SYMBOL)).toBe(544);
  });

  it("rejects missing symbols, suffix matches, and names without a function entry", () => {
    const binary = executable();
    expect(() => findGoFunctionFileOffset(binary, "missing")).toThrow("Could not find Go function");
    expect(() => findGoFunctionFileOffset(binary, "contentmapper.HasReservedSourceExtension")).toThrow(
      "Could not find Go function"
    );
    binary.writeInt32LE(-1, 1572);
    expect(() => findGoFunctionFileOffset(binary, HAS_RESERVED_EXTENSION_SYMBOL)).toThrow("Could not find Go function");
  });

  it.each(["instruction", "pointer", "zero functions", "too many functions", "names", "table", "truncated"])(
    "skips an invalid %s header",
    kind => {
      const binary = executable();
      if (kind === "instruction") binary[1030] = 0;
      if (kind === "pointer") binary[1031] = 4;
      if (kind === "zero functions") binary.writeBigUInt64LE(0n, 1032);
      if (kind === "too many functions") binary.writeBigUInt64LE(1_000_000n, 1032);
      if (kind === "names") binary.writeBigUInt64LE(4096n, 1056);
      if (kind === "table") binary.writeBigUInt64LE(4096n, 1088);
      if (kind === "truncated") {
        binary.fill(0, 1024, 1032);
        binary.writeUInt32LE(0xfffffff1, 2040);
        binary[2046] = 1;
        binary[2047] = 8;
      }
      expect(() => findGoFunctionFileOffset(binary, HAS_RESERVED_EXTENSION_SYMBOL)).toThrow(
        "Could not find Go function"
      );
    }
  );
});

describe("patchTsc", () => {
  it.each(["arm64", "x64"])("patches %s return values atomically and is idempotent", arch => {
    const dir = mkdtempSync(join(tmpdir(), "webda-patch-"));
    const binaryPath = join(dir, "tsc");
    try {
      writeFileSync(binaryPath, executable(), { mode: 0o755 });
      const result = patchTsc({ binaryPath, arch, platform: "linux" });
      expect(result).toMatchObject({ patched: true, alreadyPatched: false });
      expect(result.offsets).toEqual({ [HAS_RESERVED_EXTENSION_SYMBOL]: 528, [IS_PACKAGE_ALLOWED_SYMBOL]: 544 });
      const patched = readFileSync(binaryPath);
      expect(patched.subarray(528, 528 + (arch === "arm64" ? 8 : 3))).toEqual(
        Buffer.from(arch === "arm64" ? [0, 0, 128, 82, 192, 3, 95, 214] : [49, 192, 195])
      );
      expect(patched.subarray(544, 544 + (arch === "arm64" ? 8 : 6))).toEqual(
        Buffer.from(arch === "arm64" ? [32, 0, 128, 82, 192, 3, 95, 214] : [184, 1, 0, 0, 0, 195])
      );
      expect(patched.subarray(552)).toEqual(executable().subarray(552));
      expect(patchTsc({ binaryPath, arch, platform: "linux" })).toMatchObject({ patched: false, alreadyPatched: true });
      expect(existsSync(`${binaryPath}.webda-patch-${process.pid}`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("signs on macOS and leaves the original intact when replacing fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "webda-patch-"));
    const binaryPath = join(dir, "tsc");
    try {
      writeFileSync(binaryPath, executable());
      vi.mocked(renameSync).mockImplementationOnce(() => {
        throw new Error("rename denied");
      });
      expect(() => patchTsc({ binaryPath, platform: "darwin" })).toThrow("rename denied");
      expect(execFileSync).toHaveBeenCalledWith(
        "codesign",
        ["-s", "-", "-f", `${binaryPath}.webda-patch-${process.pid}`],
        { stdio: "pipe" }
      );
      expect(readFileSync(binaryPath)).toEqual(executable());
      expect(existsSync(`${binaryPath}.webda-patch-${process.pid}`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported architectures before writing", () => {
    expect(() => patchTsc({ arch: "unsupported" })).toThrow("Unsupported architecture");
  });
});

describe("binary resolution and CLI", () => {
  it.each(["win32", "linux"])("resolves the native executable on %s", platform => {
    const original = Object.getOwnPropertyDescriptor(process, "platform")!;
    const resolve = vi.fn().mockReturnValue(join(tmpdir(), "typescript", "package.json"));
    vi.mocked(createRequire)
      .mockReturnValueOnce({ resolve } as any)
      .mockReturnValueOnce({ resolve } as any);
    try {
      Object.defineProperty(process, "platform", { value: platform });
      expect(findTscBinary()).toBe(join(tmpdir(), "typescript", "lib", platform === "win32" ? "tsc.exe" : "tsc"));
      expect(resolve).toHaveBeenCalledWith(`@typescript/typescript-${platform}-${process.arch}/package.json`);
    } finally {
      Object.defineProperty(process, "platform", original);
    }
  });

  it.each([false, true])("reports CLI patch status (already patched: %s)", async alreadyPatched => {
    const binary = executable();
    if (alreadyPatched) {
      const arm64 = process.arch === "arm64";
      Buffer.from(arm64 ? [0, 0, 128, 82, 192, 3, 95, 214] : [49, 192, 195]).copy(binary, 528);
      Buffer.from(arm64 ? [32, 0, 128, 82, 192, 3, 95, 214] : [184, 1, 0, 0, 0, 195]).copy(binary, 544);
    }
    vi.mocked(readFileSync).mockReturnValueOnce(binary);
    if (!alreadyPatched) {
      vi.mocked(statSync).mockReturnValueOnce({ mode: 0o755 } as any);
      vi.mocked(writeFileSync).mockImplementationOnce(() => {});
      vi.mocked(renameSync).mockImplementationOnce(() => {});
      vi.mocked(rmSync).mockImplementationOnce(() => {});
    }
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const argv = process.argv;
    try {
      process.argv = [argv[0], fileURLToPath(new URL("./patch-tsc.ts", import.meta.url))];
      vi.resetModules();
      await import("./patch-tsc.ts");
      expect(log).toHaveBeenCalledWith(expect.stringContaining(alreadyPatched ? "tsc already patched" : "Patched tsc"));
    } finally {
      process.argv = argv;
    }
  });

  it("does not run the CLI without an entry point", async () => {
    const argv = process.argv;
    try {
      process.argv = [argv[0]];
      vi.resetModules();
      await import("./patch-tsc.ts");
    } finally {
      process.argv = argv;
    }
  });
});
