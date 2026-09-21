#!/usr/bin/env node
/**
 * Entry point for the schema worker; see `./worker.ts` for the protocol.
 */
import { main } from "./worker.ts";

await main();
