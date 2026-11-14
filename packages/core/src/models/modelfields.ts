import { useModelMetadata } from "../core/hooks.js";

/**
 * The primary key fields of a model, from its metadata
 * @param model - the model class
 * @returns the field names, `["uuid"]` by default
 */
export function primaryKeyFields(model: any): string[] {
  let fields: unknown;
  try {
    fields = useModelMetadata(model)?.PrimaryKey;
  } catch {
    // A class registered without metadata
  }
  return Array.isArray(fields) && fields.length ? fields.map(String) : ["uuid"];
}

/**
 * The fields of the Output schema of a model class, from its own metadata: a class defined without metadata inherits
 * the `Metadata` of its parent class, whose schema does not describe it
 * @param model - the model class
 * @returns the field names, undefined without Output schema metadata
 */
export function outputFields(model: any): string[] | undefined {
  const properties =
    model && Object.hasOwn(model, "Metadata") ? model.Metadata?.Schemas?.Output?.properties : undefined;
  return properties && typeof properties === "object" ? Object.keys(properties) : undefined;
}

/**
 * Return every subclass of the model, transitively, from its metadata
 * @param model - a model class
 * @param seen - the subclasses found so far
 * @returns every subclass of the model, transitively, from its metadata
 */
export function subclassesOf(model: any, seen: Set<any> = new Set()): any[] {
  let metadata: any;
  try {
    metadata = useModelMetadata(model);
  } catch {
    // A class registered without metadata
  }
  for (const sub of (metadata ?? model?.Metadata)?.Subclasses ?? []) {
    if (typeof sub === "function" && !seen.has(sub)) {
      seen.add(sub);
      subclassesOf(sub, seen);
    }
  }
  return [...seen];
}

/**
 * The fields a client can see of the objects a model class returns: the Output schema fields of the class and of its
 * subclasses (a query or a read through a class returns the rows of its subclasses), plus the primary key
 * @param model - the model class
 * @returns the field names, undefined when the class has no Output schema metadata of its own (fields are then not
 * checked)
 */
export function visibleFields(model: any): Set<string> | undefined {
  if (!outputFields(model)) {
    return undefined;
  }
  const allowed = new Set(primaryKeyFields(model));
  for (const clazz of [model, ...subclassesOf(model)]) {
    outputFields(clazz)?.forEach(name => allowed.add(name));
  }
  return allowed;
}
