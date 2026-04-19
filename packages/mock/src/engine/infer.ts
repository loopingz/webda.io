import type { MockKind } from "@webda/models";

export type InferContext = {
  fieldName: string;
  declaredType?: string;
};

/** Case-insensitive exact-match field-name heuristic. Includes type-guarded `*At` rule. */
const NAME_TO_KIND: Record<string, MockKind> = {
  email: "email",
  phone: "phone",
  phonenumber: "phone",
  url: "url",
  website: "url",
  firstname: "firstName",
  lastname: "lastName",
  fullname: "fullName",
  uuid: "uuid",
  id: "uuid",
  avatar: "avatar",
  image: "avatar",
  photo: "avatar",
  createdat: "recentDate",
  updatedat: "recentDate"
};

const TYPE_TO_KIND: Record<string, MockKind> = {
  string: "lorem",
  number: "integer",
  boolean: "boolean" as MockKind,
  date: "recentDate"
};

/**
 * Resolve a mock kind from a field's name (strong signal) or declared type
 * (weak fallback). Returns `null` when no rule matches — callers decide
 * whether to warn, throw, or skip.
 */
export function inferKind(ctx: InferContext): MockKind | null {
  const lower = ctx.fieldName.toLowerCase();

  const direct = NAME_TO_KIND[lower];
  if (direct) return direct;

  if (lower.endsWith("at") && ctx.declaredType === "Date") return "pastDate";

  if (ctx.declaredType) {
    const tk = TYPE_TO_KIND[ctx.declaredType.toLowerCase()];
    if (tk) return tk;
  }

  return null;
}
