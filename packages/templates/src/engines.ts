import { useLog } from "@webda/core";
import type { TemplateEngine } from "./itemplate.js";

const engines: Map<string, TemplateEngine> = new Map();

/**
 * Register a template engine
 *
 * @param name - the name to use, letters, digits, `_`, `-` and `.` only
 * @param engine - the engine implementation
 */
export function registerTemplateEngine(name: string, engine: TemplateEngine): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error(`Invalid template engine name '${name}'`);
  }
  if (engines.has(name) && engines.get(name) !== engine) {
    useLog("WARN", `Template engine '${name}' already registered, replacing it`);
  }
  engines.set(name, engine);
}

/**
 * Get a registered engine
 * @param name - the engine name
 * @returns the engine or undefined
 */
export function getTemplateEngine(name: string): TemplateEngine | undefined {
  return engines.get(name);
}

/**
 * List the registered engine names
 * @returns names in registration order
 */
export function listTemplateEngines(): string[] {
  return [...engines.keys()];
}

/**
 * Find the engine for a file extension
 * @param ext - extension without the dot
 * @param preferred - engine name that wins when several handle the extension
 * @returns the engine, or undefined
 */
export function getEngineForExtension(
  ext: string,
  preferred?: string
): { name: string; engine: TemplateEngine } | undefined {
  const matches = [...engines.entries()].filter(([, engine]) => engine.extensions.includes(ext));
  const found = matches.find(([name]) => name === preferred) ?? matches[0];
  return found ? { name: found[0], engine: found[1] } : undefined;
}
