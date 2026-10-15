#!/usr/bin/env node
import { main } from "../cli.js";

process.exitCode = main(process.argv.slice(2));
