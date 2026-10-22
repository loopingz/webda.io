import { useLog } from "@webda/core";
import { mkdirSync, readdirSync, writeFileSync } from "fs";
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
  source: string;
  /**
   * Folder where the mustache templates are written
   * @default "./templates"
   */
  output: string;
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
        candidates.push({ file, template: relative(source, dirname(file)).split("\\").join("/"), needsProbe: false });
      } else if (dir === source) {
        const match = entry.name.match(/^([^.]+)(?:\.([^.]+))?\.[tj]sx$/);
        if (match) {
          candidates.push({
            file,
            template: match[2] ? `${match[1]}/${match[2]}` : match[1],
            needsProbe: true
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
 *
 * @param options - precompile options
 * @returns the generated, skipped and failed template paths
 */
export async function precompile(options: PrecompileOptions): Promise<PrecompileResult> {
  const source = resolve(options.source ?? "./emails");
  const output = resolve(options.output ?? "./templates");
  const result: PrecompileResult = { generated: [], skipped: [], failed: [] };
  for (const { file, template, needsProbe } of collect(source)) {
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
      const rendered = await renderEmail(component, placeholders, {
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
