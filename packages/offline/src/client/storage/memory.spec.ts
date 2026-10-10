import { storageConformance } from "./conformance.js";
import { MemoryStorage } from "./memory.js";

storageConformance("MemoryStorage", async () => new MemoryStorage());
