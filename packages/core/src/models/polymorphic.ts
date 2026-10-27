import { modelLinkIdentity, sameModelLink, type ModelLinkData, type Storable } from "@webda/models";
import { bind } from "@webda/ql";
import { useApplication } from "../application/hooks.js";
import { useContext } from "../contexts/execution.js";
import type { IOperationContext } from "../contexts/icontext.js";
import { BadRequest, NotFound } from "../errors/errors.js";
import { isModelActionAllowed, loadModelForAction } from "./permissions.js";

/**
 * Resolve an opaque reference against the active application, checking the caller's read permission.
 * Unknown, missing, deleted and unreadable targets all answer like an ordinary missing object.
 * @param reference - canonical model identifier and primary key
 * @param context - current caller by default
 * @returns the readable target (never cached)
 */
export async function loadModelLink<T extends Storable = Storable>(
  reference: ModelLinkData,
  context: IOperationContext = useContext()
): Promise<T> {
  let identity: ModelLinkData;
  try {
    identity = modelLinkIdentity(reference);
  } catch {
    throw new BadRequest("Invalid polymorphic link");
  }
  const models = useApplication().getModels();
  const model = Object.hasOwn(models, identity.model) ? models[identity.model] : undefined;
  if (!model) throw new NotFound("Object not found");
  return loadModelForAction<T>(model, identity.key, context, "get");
}

/** A readable source object and the references on one attribute that point to the requested target. */
export interface ModelBacklink {
  /** Canonical source model identifier. */
  model: string;
  /** Source primary key. */
  key: ModelLinkData["key"];
  /** Attribute containing the matching references. */
  attribute: string;
  /** Readable source object. */
  source: Storable;
  /** Matching reference data, including custom properties. */
  references: ModelLinkData[];
}

/** Bounds of a portable backlink scan. */
export interface ModelBacklinkOptions {
  /** Restrict source models to these exact registered identifiers. */
  models?: readonly string[];
  /** Maximum attribute matches to yield, defaults to 100. */
  limit?: number;
  /** Maximum source rows and page requests across all models, defaults to 10,000. Exceeding either throws. */
  scanLimit?: number;
  /** Current caller by default. */
  context?: IOperationContext;
}

/**
 * Find readable objects whose polymorphic links point to a readable target.
 * This portable implementation scans source models with polymorphic-link metadata, so it works without a store
 * specific nested-array operator. Both identity fields must match the SAME array element. Stores may index these
 * fields for application-specific optimized queries. No cascade or cleanup is performed.
 * @param target - model instance or serialized reference
 * @param options - caller, source restrictions and scan bounds
 * @yields one entry per matching source attribute; throws rather than silently truncating at the scan budget
 */
export async function* findModelBacklinks(
  target: Storable | ModelLinkData,
  options: ModelBacklinkOptions = {}
): AsyncGenerator<ModelBacklink> {
  const context = options.context ?? useContext();
  const identity = modelLinkIdentity(target);
  await loadModelLink(identity, context);
  const limit = options.limit ?? 100;
  const scanLimit = options.scanLimit ?? 10_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(scanLimit) || scanLimit < 1) {
    throw new BadRequest("Backlink limits must be positive safe integers");
  }
  const models = useApplication().getModels();
  let scanned = 0;
  let pages = 0;
  let yielded = 0;
  const seen = new Set<string>();
  for (const id of [...new Set(options.models ?? Object.keys(models))].sort()) {
    if (!Object.hasOwn(models, id)) throw new BadRequest("Unknown backlink source model");
    const model = models[id];
    const relations = (model as any).Metadata?.Relations?.polymorphicLinks ?? [];
    const attributes = relations.filter(link => !link.models || link.models.includes(identity.model));
    if (!attributes.length) continue;
    let token: string | undefined;
    const tokens = new Set<string>();
    do {
      if (++pages > scanLimit)
        throw new BadRequest("Backlink page limit exceeded; narrow the source models or raise scanLimit");
      const page = await model.query(
        bind(token ? "LIMIT :limit OFFSET :offset" : "LIMIT :limit", {
          limit: Math.min(100, scanLimit - scanned + 1),
          ...(token ? { offset: token } : {})
        })
      );
      for (const source of page.results) {
        if (++scanned > scanLimit)
          throw new BadRequest("Backlink scan limit exceeded; narrow the source models or raise scanLimit");
        if (source.isDeleted?.() || !(await isModelActionAllowed(source, context, "get", model))) continue;
        for (const { attribute } of attributes) {
          // Private attributes are never discoverable through this public read helper.
          if (attribute.startsWith("__")) continue;
          const values = source[attribute];
          const stored = typeof values?.toJSON === "function" ? values.toJSON() : values;
          if (!Array.isArray(stored)) continue;
          const references = stored.filter(value => value && sameModelLink(value, identity));
          if (!references.length) continue;
          const own = modelLinkIdentity(source);
          const fingerprint = JSON.stringify([
            own.model,
            Object.entries(typeof own.key === "object" ? own.key : { key: own.key }).sort(),
            attribute
          ]);
          if (seen.has(fingerprint)) continue;
          seen.add(fingerprint);
          yield { ...own, attribute, source, references };
          if (++yielded >= limit) return;
        }
      }
      token = page.continuationToken;
      if (token && tokens.has(token)) throw new BadRequest("Backlink store pagination did not progress");
      if (token) tokens.add(token);
    } while (token);
  }
}
