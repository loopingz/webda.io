/**
 * Binary patcher for TypeScript 7 (`tsgo`) native `tsc` executable.
 *
 * TypeScript `7.1.0-dev.20261102+` changed `contentmapper.HasReservedSourceExtension`
 * from an exact match (`ext == ".ts"`) to a suffix match (`strings.HasSuffix(ext, ".ts")`),
 * rejecting compound extensions such as `.model.ts` and `.service.ts` with `TS18066`,
 * and added `project.(*configFileRegistryBuilder).IsContentMapperPackageAllowed` (`TS18124`),
 * which rejects pnpm-symlinked content mapper packages in LSP mode.
 *
 * The rest of the `tsgo` compiler and LSP pipeline still supports `.model.ts` and
 * `.service.ts` natively once those two checks are relaxed. This module locates the
 * target Go functions directly via the embedded Go 1.20+ `pclntab` symbol table
 * (across Mach-O, ELF, and PE binaries) and patches them idempotently.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Symbol name for the reserved extension check in `tsc`. */
export const HAS_RESERVED_EXTENSION_SYMBOL =
  "github.com/microsoft/TypeScript/tsc/internal/contentmapper.HasReservedSourceExtension";

/** Symbol name for the LSP workspace package path check in `tsc`. */
export const IS_PACKAGE_ALLOWED_SYMBOL =
  "github.com/microsoft/TypeScript/tsc/internal/project.(*configFileRegistryBuilder).IsContentMapperPackageAllowed";

/** Machine-code stubs for returning `false` (0) or `true` (1) on supported architectures. */
const STUBS: Record<string, { retFalse: Buffer; retTrue: Buffer }> = {
  arm64: {
    // mov w0, #0; ret
    retFalse: Buffer.from([0x00, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6]),
    // mov w0, #1; ret
    retTrue: Buffer.from([0x20, 0x00, 0x80, 0x52, 0xc0, 0x03, 0x5f, 0xd6])
  },
  x64: {
    // xor eax, eax; ret
    retFalse: Buffer.from([0x31, 0xc0, 0xc3]),
    // mov eax, 1; ret
    retTrue: Buffer.from([0xb8, 0x01, 0x00, 0x00, 0x00, 0xc3])
  }
};

export interface PatchTscOptions {
  /** Explicit path to the native `tsc` binary. Resolved from `typescript` if omitted. */
  binaryPath?: string;
  /** Target CPU architecture (`arm64` or `x64`). Defaults to `process.arch`. */
  arch?: string;
  /** Target platform (`darwin`, `linux`, `win32`). Defaults to `process.platform`. */
  platform?: string;
}

export interface PatchTscResult {
  /** Absolute path to the `tsc` binary. */
  binaryPath: string;
  /** True if the binary was modified during this call. */
  patched: boolean;
  /** True if the binary already had all patches applied before this call. */
  alreadyPatched: boolean;
  /** File offsets of each patched Go function. */
  offsets: Record<string, number>;
}

/**
 * Locate the native `tsc` binary bundled with the installed `typescript` 7.x package.
 * @param fromUrl - Module URL or file path to resolve `typescript` from
 * @returns Absolute path to the native `tsc` binary
 */
export function findTscBinary(fromUrl: string = import.meta.url): string {
  const req = createRequire(fromUrl);
  const tsRequire = createRequire(req.resolve("typescript/package.json"));
  const pkg = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
  const manifest = tsRequire.resolve(pkg);
  const exe = process.platform === "win32" ? "tsc.exe" : "tsc";
  return join(dirname(manifest), "lib", exe);
}

/**
 * Find the file offset of the `.text` / `__text` code section in a Mach-O, ELF, or PE binary.
 * @param buf - Raw binary buffer
 * @returns File offset where the code section begins
 */
export function findTextSectionFileOffset(buf: Buffer): number {
  // 1. Mach-O 64-bit little-endian (0xfeedfacf)
  if (buf.length >= 32 && buf.readUInt32LE(0) === 0xfeedfacf) {
    const ncmds = buf.readUInt32LE(16);
    let cmdOff = 32;
    for (let i = 0; i < ncmds; i++) {
      const cmd = buf.readUInt32LE(cmdOff);
      const cmdSize = buf.readUInt32LE(cmdOff + 4);
      // LC_SEGMENT_64 = 0x19
      if (cmd === 0x19) {
        const nsects = buf.readUInt32LE(cmdOff + 64);
        let sectOff = cmdOff + 72;
        for (let s = 0; s < nsects; s++) {
          const sectName = buf
            .subarray(sectOff, sectOff + 16)
            .toString("utf8")
            .replace(/\0+$/, "");
          if (sectName === "__text") {
            return buf.readUInt32LE(sectOff + 48);
          }
          sectOff += 80;
        }
      }
      cmdOff += cmdSize;
    }
    throw new Error("Could not find __text section in Mach-O binary");
  }

  // 2. ELF 64-bit little-endian (0x7f 'E' 'L' 'F', class = 2)
  if (buf.length >= 64 && buf.readUInt32BE(0) === 0x7f454c46 && buf[4] === 2) {
    const shoff = Number(buf.readBigUInt64LE(40));
    const shentsize = buf.readUInt16LE(58);
    const shnum = buf.readUInt16LE(60);
    const shstrndx = buf.readUInt16LE(62);
    const shstrTabOff = Number(buf.readBigUInt64LE(shoff + shstrndx * shentsize + 24));
    for (let i = 0; i < shnum; i++) {
      const entryOff = shoff + i * shentsize;
      const nameIdx = buf.readUInt32LE(entryOff);
      const nameEnd = buf.indexOf(0, shstrTabOff + nameIdx);
      const name = buf.subarray(shstrTabOff + nameIdx, nameEnd).toString("utf8");
      if (name === ".text") {
        return Number(buf.readBigUInt64LE(entryOff + 24));
      }
    }
    throw new Error("Could not find .text section in ELF binary");
  }

  // 3. PE / COFF ("MZ")
  if (buf.length >= 64 && buf.readUInt16LE(0) === 0x5a4d) {
    const peOff = buf.readUInt32LE(0x3c);
    if (buf.readUInt32LE(peOff) !== 0x00004550) {
      throw new Error("Invalid PE signature");
    }
    const numSections = buf.readUInt16LE(peOff + 6);
    const optHdrSize = buf.readUInt16LE(peOff + 20);
    let secOff = peOff + 24 + optHdrSize;
    for (let i = 0; i < numSections; i++) {
      const name = buf
        .subarray(secOff, secOff + 8)
        .toString("utf8")
        .replace(/\0+$/, "");
      if (name === ".text") {
        return buf.readUInt32LE(secOff + 20);
      }
      secOff += 40;
    }
    throw new Error("Could not find .text section in PE binary");
  }

  throw new Error("Unsupported executable format (expected Mach-O, ELF, or PE)");
}

/**
 * Locate the file offset of a Go function in a compiled Go 1.20+ binary via its embedded `pclntab`.
 * @param buf - Raw binary buffer
 * @param funcName - Fully-qualified Go symbol name
 * @returns File offset of the function entry point in the binary
 */
export function findGoFunctionFileOffset(buf: Buffer, funcName: string): number {
  const textFileOffset = findTextSectionFileOffset(buf);
  // Go 1.20+ pclntab magic: 0xfffffff1 (LE: f1 ff ff ff 00 00)
  const magic = Buffer.from([0xf1, 0xff, 0xff, 0xff, 0x00, 0x00]);
  const needle = Buffer.from(`${funcName}\0`, "utf8");

  let pos = 0;
  while ((pos = buf.indexOf(magic, pos)) !== -1) {
    const minLC = buf[pos + 6];
    const ptrSize = buf[pos + 7];
    if ((minLC === 1 || minLC === 2 || minLC === 4) && ptrSize === 8 && pos + 72 <= buf.length) {
      const nfunc = Number(buf.readBigUInt64LE(pos + 8));
      const funcnameOffset = Number(buf.readBigUInt64LE(pos + 32));
      const pclnOffset = Number(buf.readBigUInt64LE(pos + 64));
      const funcnameTab = pos + funcnameOffset;
      const pclnTab = pos + pclnOffset;

      if (nfunc > 0 && nfunc < 1_000_000 && funcnameTab < buf.length && pclnTab < buf.length) {
        let searchPos = funcnameTab;
        while ((searchPos = buf.indexOf(needle, searchPos)) !== -1) {
          if (searchPos === funcnameTab || buf[searchPos - 1] === 0) {
            const targetNameOff = searchPos - funcnameTab;
            for (let i = 0; i < nfunc; i++) {
              const entryOff = buf.readUInt32LE(pclnTab + i * 8);
              const funcOff = buf.readUInt32LE(pclnTab + i * 8 + 4);
              const fnNameOff = buf.readInt32LE(pclnTab + funcOff + 4);
              if (fnNameOff === targetNameOff) {
                return textFileOffset + entryOff;
              }
            }
          }
          searchPos += needle.length;
        }
      }
    }
    pos += magic.length;
  }

  throw new Error(`Could not find Go function '${funcName}' in pclntab`);
}

/**
 * Patch the native `tsc` binary so `.model.ts` and `.service.ts` content mappers are allowed.
 * @param options - Optional binary path and target architecture/platform overrides
 * @returns Patch result details
 */
export function patchTsc(options: PatchTscOptions = {}): PatchTscResult {
  const binaryPath = options.binaryPath ?? findTscBinary();
  const arch = options.arch ?? process.arch;
  const platform = options.platform ?? process.platform;
  const stubs = STUBS[arch];
  if (!stubs) {
    throw new Error(`Unsupported architecture for tsc binary patching: ${arch}`);
  }

  const buf = readFileSync(binaryPath);
  const targets: { symbol: string; stub: Buffer }[] = [
    { symbol: HAS_RESERVED_EXTENSION_SYMBOL, stub: stubs.retFalse },
    { symbol: IS_PACKAGE_ALLOWED_SYMBOL, stub: stubs.retTrue }
  ];

  const offsets: Record<string, number> = {};
  let allAlreadyPatched = true;

  for (const { symbol, stub } of targets) {
    const fileOffset = findGoFunctionFileOffset(buf, symbol);
    offsets[symbol] = fileOffset;
    const current = buf.subarray(fileOffset, fileOffset + stub.length);
    if (!current.equals(stub)) {
      allAlreadyPatched = false;
      stub.copy(buf, fileOffset);
    }
  }

  if (allAlreadyPatched) {
    return {
      binaryPath,
      patched: false,
      alreadyPatched: true,
      offsets
    };
  }

  // Write to a sibling temporary file and atomically rename so macOS creates a fresh
  // vnode instead of invalidating the cached code-signature pages of the existing inode.
  const mode = statSync(binaryPath).mode;
  const tmpPath = `${binaryPath}.webda-patch-${process.pid}`;
  try {
    writeFileSync(tmpPath, buf, { mode });
    if (platform === "darwin") {
      execFileSync("codesign", ["-s", "-", "-f", tmpPath], { stdio: "pipe" });
    }
    renameSync(tmpPath, binaryPath);
  } finally {
    rmSync(tmpPath, { force: true });
  }

  return {
    binaryPath,
    patched: true,
    alreadyPatched: false,
    offsets
  };
}

// Allow running directly via `node lib/patch-tsc.js`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = patchTsc();
  console.log(res.alreadyPatched ? `tsc already patched at ${res.binaryPath}` : `Patched tsc at ${res.binaryPath}`);
}
