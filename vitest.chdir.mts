import process from "process";

import { fileURLToPath } from "node:url";
import { vi } from "vitest";

// fileURLToPath: URL.pathname would give "/C:/..." on Windows
vi.spyOn(process, "cwd").mockReturnValue(fileURLToPath(new URL(".", import.meta.url)));
