/**
 * Model metadata used to name a CustomResourceDefinition
 */
export interface CrdModelMetadata {
  /**
   * Model identifier, e.g. `MyApp/Tenant`
   */
  Identifier: string;
  /**
   * Plural of the model, e.g. `Tenants` or `MyApp/Tenants`
   */
  Plural: string;
  /**
   * Short name of the model
   */
  ShortName?: string;
  /**
   * Primary key fields
   */
  PrimaryKey: string[];
  /**
   * Separator of a composite primary key
   */
  PrimaryKeySeparator?: string;
}

/**
 * Names of a CustomResourceDefinition
 */
export interface CrdNames {
  /**
   * Name of the CustomResourceDefinition: `<plural>.<group>`
   */
  name: string;
  /**
   * PascalCase kind, e.g. `Tenant`
   */
  kind: string;
  /**
   * Kind of the list, e.g. `TenantList`
   */
  listKind: string;
  /**
   * Lowercase plural, e.g. `tenants`
   */
  plural: string;
  /**
   * Lowercase singular, e.g. `tenant`
   */
  singular: string;
  /**
   * Lowercase short names
   */
  shortNames?: string[];
}

/** DNS-1123 label: plural, singular and short names */
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
/** DNS-1123 subdomain: object names and API groups */
const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
/** Kind: an identifier starting with a letter */
const KIND = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Whether a value is a valid Kubernetes object name (DNS-1123 subdomain)
 * @param name - the value
 * @returns true if valid
 */
export function isResourceName(name: string): boolean {
  return name.length <= 253 && DNS_SUBDOMAIN.test(name);
}

/**
 * Names of the CustomResourceDefinition of a model
 * @param metadata - the model metadata
 * @param group - the API group, e.g. `myapp.example.com`
 * @returns the names
 * @throws Error when the group or a derived name is not valid for Kubernetes
 */
export function getCrdNames(metadata: CrdModelMetadata, group: string): CrdNames {
  if (!group || !group.includes(".") || !isResourceName(group)) {
    throw new Error(`Invalid API group '${group}': a lowercase DNS subdomain with a dot is expected, e.g. example.com`);
  }
  const kind = metadata.Identifier.split("/").pop()!;
  if (!KIND.test(kind)) {
    throw new Error(`Invalid kind '${kind}' for ${metadata.Identifier}`);
  }
  // The plural can be namespaced like the identifier
  const plural = metadata.Plural.split("/").pop()!.toLowerCase();
  const singular = kind.toLowerCase();
  const shortNames = metadata.ShortName ? [metadata.ShortName.toLowerCase()] : undefined;
  for (const value of [plural, singular, ...(shortNames ?? [])]) {
    if (!DNS_LABEL.test(value)) {
      throw new Error(`Invalid name '${value}' for ${metadata.Identifier}: a lowercase DNS label is expected`);
    }
  }
  return {
    name: `${plural}.${group}`,
    kind,
    listKind: `${kind}List`,
    plural,
    singular,
    ...(shortNames ? { shortNames } : {})
  };
}

/**
 * Check a model key can be the name of its custom resources
 *
 * A composite key is joined with PrimaryKeySeparator, which must then be `-` or `.` to give a valid name
 * @param metadata - the model metadata
 * @throws Error when the key cannot give valid names
 */
export function checkResourceKey(metadata: CrdModelMetadata): void {
  if (!metadata.PrimaryKey?.length) {
    throw new Error(`${metadata.Identifier} has no primary key`);
  }
  if (metadata.PrimaryKey.length > 1 && !["-", "."].includes(metadata.PrimaryKeySeparator ?? "")) {
    throw new Error(
      `${metadata.Identifier} has a composite primary key joined with '${metadata.PrimaryKeySeparator ?? ""}': ` +
        "set PrimaryKeySeparator to '-' or '.' to store it in Kubernetes"
    );
  }
}
