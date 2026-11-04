import { WebdaError } from "@webda/core";

/** ARM template shape shared by Azure deployers and contributors. */
export interface AzureTemplate {
  $schema: string;
  contentVersion: string;
  parameters: Record<string, { type: string }>;
  resources: Record<string, any>[];
  outputs: Record<string, any>;
}

/**
 * Create an empty ARM deployment template.
 * @returns The azure template result
 */
export function createAzureTemplate(): AzureTemplate {
  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    contentVersion: "1.0.0.0",
    parameters: {},
    resources: [],
    outputs: {}
  };
}

/**
 * Quote a literal embedded inside an ARM expression.
 * @param value - Value to convert or protect
 * @returns The arm literal result
 */
export function armLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
/**
 * Strip the brackets of an expression, or quote a literal for a larger expression.
 * @param value - Value to convert or protect
 * @returns The arm value result
 */
export function armValue(value: string): string {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : armLiteral(value);
}
/**
 * Construct a resource identifier without interpolating unescaped names.
 * @param type - ARM resource type
 * @param names - Resource name segments
 * @returns The resource id result
 */
export function resourceId(type: string, ...names: string[]): string {
  return `[resourceId(${[type, ...names].map(armLiteral).join(", ")})]`;
}

/**
 * Resource identifier for a role assignment at a resource scope.
 * @param resource - ARM resource declaration
 * @returns The role assignment id result
 */
export function roleAssignmentId(resource: Record<string, any>): string {
  return `[extensionResourceId(${armValue(resource.scope)}, 'Microsoft.Authorization/roleAssignments', ${armValue(resource.name)})]`;
}

/**
 * Azure Container Apps uses five cron fields; sub-minute schedules cannot be represented.
 * @param cron - Cron expression
 * @returns The container apps schedule result
 */
export function containerAppsSchedule(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length === 6 && fields[0] === "0") fields.shift();
  if (fields.length !== 5)
    throw new WebdaError.BadRequest("Container Apps cron must use five fields, or six with seconds set to 0");
  return fields.join(" ");
}

/**
 * Functions timers use six-field NCRONTAB with seconds first.
 * @param cron - Cron expression
 * @returns The functions schedule result
 */
export function functionsSchedule(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length === 5) fields.unshift("0");
  if (fields.length !== 6) throw new WebdaError.BadRequest("Functions cron requires five or six fields");
  return fields.join(" ");
}
