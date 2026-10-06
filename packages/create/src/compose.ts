import { deepMerge } from "./merge.js";
import type { Store, Transport } from "./options.js";
import type { FileMap, Template } from "./template.js";

/**
 * The templates cannot be combined; a bug in the templates, not user input
 */
export class ComposeError extends Error {}

const TRANSPORT_OVERLAYS: Transport[] = ["graphql", "grpc", "mcp"];

/**
 * Overlay folders to apply, in order: store first, then transports
 * @param store - selected store; `memory` needs no overlay
 * @param transports - selected transports; `rest` is part of the base
 * @returns overlay folder names under `templates/features/`
 */
export function overlayNames(store: Store, transports: Transport[]): string[] {
  const names = store === "memory" ? [] : [`store-${store}`];
  return [...names, ...TRANSPORT_OVERLAYS.filter(name => transports.includes(name))];
}

export interface Composed {
  files: FileMap;
  packageJson: Record<string, any>;
  config: Record<string, any>;
  agentNotes: string[];
}

/**
 * Apply overlays on top of the base template
 * @param base - base app
 * @param overlays - overlays in application order
 * @param options - `rest: false` removes the base `RESTService`
 * @returns merged files, package.json, configuration and agent notes
 */
export function compose(base: Template, overlays: Template[], options: { rest: boolean }): Composed {
  const files: FileMap = new Map(base.files);
  const owner = new Map<string, string>();
  let packageJson = base.packageJson;
  let config = base.config;
  const agentNotes: string[] = [];
  for (const overlay of overlays) {
    for (const [path, content] of overlay.files) {
      if (owner.has(path)) {
        throw new ComposeError(`Overlays "${owner.get(path)}" and "${overlay.name}" both write ${path}`);
      }
      owner.set(path, overlay.name);
      files.set(path, content);
    }
    packageJson = deepMerge(packageJson, overlay.packageJson);
    config = deepMerge(config, overlay.config);
    if (overlay.agents.trim()) agentNotes.push(overlay.agents.trim());
  }
  if (!options.rest && config.services) {
    config = structuredClone(config);
    delete config.services.RESTService;
  }
  return { files, packageJson, config, agentNotes };
}
