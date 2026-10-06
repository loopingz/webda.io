#!/usr/bin/env node
import { defaultDeps, main } from "./index.js";

process.exitCode = await main(await defaultDeps());
