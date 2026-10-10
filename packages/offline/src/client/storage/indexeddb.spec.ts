import "fake-indexeddb/auto";
import { storageConformance } from "./conformance.js";
import { IndexedDBStorage } from "./indexeddb.js";

let n = 0;
storageConformance("IndexedDBStorage", async () => new IndexedDBStorage(`test-${n++}`));
