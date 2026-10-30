import { CronDefinition, templateVariables } from "@webda/core";

/**
 * Replaces placeholders in a given template string with values from a CronDefinition object and other replacements.
 *
 * Besides the CronDefinition fields (`cron.operationId`, `cron.cron`, ...), the cron exposes:
 *  - operationName: the operation id with its dots replaced by dashes, usable in a resource name
 *  - inputJson: the operation input as JSON
 *  - inputb64: the operation input as base64 encoded JSON
 *
 * @param template - The template string to replace placeholders in.
 * @param cron - The CronDefinition object containing values to replace placeholders with.
 * @param replacements - Optional additional replacements to use in the template string.
 * @returns The template string with all placeholders replaced with their corresponding values.
 */
export function CronReplace(template: string | any, cron: CronDefinition, replacements: any = {}) {
  const inputJson = JSON.stringify(cron.input ?? {});
  return templateVariables(template, {
    ...replacements,
    env: process.env,
    cron: {
      ...cron,
      operationName: cron.operationId.replace(/\./g, "-"),
      inputJson,
      inputb64: Buffer.from(inputJson).toString("base64")
    }
  });
}
