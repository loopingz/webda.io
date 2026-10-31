import { useLog } from "@webda/core";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { importEmail } from "./loader.js";
import { renderEmail } from "./render.js";

/**
 * Options of {@link precompile}
 */
export interface PrecompileOptions {
  /**
   * Folder containing the emails
   * @default "./emails"
   */
  source?: string;
  /**
   * Folder where the mustache templates are written
   * @default "./templates"
   */
  output?: string;
  /**
   * Pretty print the html
   * @default true
   */
  pretty?: boolean;
  /**
   * Replace `&#x27;` by `'` in the html
   * @default true
   */
  fixApostrophes?: boolean;
  /**
   * Source to compiled prefix map, see `importEmail`
   */
  sourceMap?: Record<string, string>;
}

/**
 * Result of {@link precompile}, template paths are relative to the output folder
 */
export interface PrecompileResult {
  generated: string[];
  skipped: string[];
  failed: string[];
}

interface Candidate {
  file: string;
  template: string;
  /** Only a template if the default export has Subject or PreviewProps */
  needsProbe: boolean;
  /** Locale of a locale variant, passed to the component as the `locale` prop */
  locale?: string;
}

/**
 * Check a folder holds an `email.tsx` or `email.jsx` entry
 * @param dir - the folder
 * @returns true if it does
 */
function hasEmail(dir: string): boolean {
  return existsSync(join(dir, "email.tsx")) || existsSync(join(dir, "email.jsx"));
}

/**
 * Collect the candidate email files of a folder
 *
 * @param source - absolute source folder
 * @returns the candidates
 */
function collect(source: string): Candidate[] {
  const candidates: Candidate[] = [];
  const walk = function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") {
          walk(file);
        }
      } else if (/^email\.[tj]sx$/.test(entry.name)) {
        const template = relative(source, dirname(file)).split("\\").join("/");
        // `<name>/<locale>/email.tsx`: a folder below another email folder is a locale variant
        const locale =
          dir !== source && hasEmail(dirname(dir)) ? template.substring(template.lastIndexOf("/") + 1) : undefined;
        candidates.push({ file, template, needsProbe: false, locale });
      } else if (dir === source) {
        const match = entry.name.match(/^([^.]+)(?:\.([^.]+))?\.[tj]sx$/);
        if (match) {
          candidates.push({
            file,
            template: match[2] ? `${match[1]}/${match[2]}` : match[1],
            needsProbe: true,
            locale: match[2]
          });
        }
      }
    }
  };
  walk(source);
  return candidates;
}

/**
 * Precompile react-email templates into mustache templates
 *
 * Each string or number `PreviewProps` key is replaced by a `{{{key}}}` placeholder before rendering.
 * Templates with other kinds of props are skipped: they need the runtime react-email engine.
 * A locale variant (`<name>/<locale>/email.tsx` or `<name>.<locale>.tsx`) also gets its `locale` prop, as at runtime.
 *
 * @param options - precompile options
 * @returns the generated, skipped and failed template paths
 */
export async function precompile(options: PrecompileOptions): Promise<PrecompileResult> {
  const source = resolve(options.source ?? "./emails");
  const output = resolve(options.output ?? "./templates");
  const result: PrecompileResult = { generated: [], skipped: [], failed: [] };
  for (const { file, template, needsProbe, locale } of collect(source)) {
    try {
      const component = await importEmail(file, options.sourceMap);
      if (needsProbe && component.Subject === undefined && component.PreviewProps === undefined) {
        continue;
      }
      const placeholders: Record<string, string> = {};
      let unsupported: string | undefined;
      for (const [key, value] of Object.entries(component.PreviewProps ?? {})) {
        if (typeof value === "string" || typeof value === "number") {
          placeholders[key] = `{{{${key}}}}`;
        } else {
          unsupported = key;
          break;
        }
      }
      if (unsupported !== undefined) {
        useLog(
          "WARN",
          `react-email template '${template}': PreviewProps.${unsupported} is not a string, use the runtime react-email engine`
        );
        result.skipped.push(template);
        continue;
      }
      const rendered = await renderEmail(component, locale ? { ...placeholders, locale } : placeholders, {
        pretty: options.pretty ?? true,
        fixApostrophes: options.fixApostrophes ?? true
      });
      const folder = join(output, template);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "html.mustache"), rendered.html);
      writeFileSync(join(folder, "text.mustache"), rendered.text);
      writeFileSync(join(folder, "subject.mustache"), rendered.subject || "No Subject");
      result.generated.push(template);
    } catch (err: any) {
      useLog("ERROR", `react-email template '${template}' failed: ${err?.message ?? err}`);
      result.failed.push(template);
    }
  }
  return result;
}
