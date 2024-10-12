import process from "process";

import { vi } from "vitest";

vi.spyOn(process, "cwd").mockReturnValue(new URL(".", import.meta.url).pathname);
