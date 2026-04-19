/**
 * Mock-data decorator surface. The decorators here only stash metadata on
 * `Symbol.metadata`; they do NOT import Faker, an AI SDK, or any other
 * generation engine. Production apps that use `@Mock.email` pay only the
 * cost of one metadata write per field.
 *
 * The `@webda/mock` package reads the metadata via `readMockMeta()` and
 * decides how to generate values.
 */
const MOCK_META = "webda:mock";

export type MockKind =
  | "uuid" | "email" | "firstName" | "lastName" | "fullName" | "phone" | "url"
  | "avatar" | "lorem" | "word" | "integer" | "float" | "percentage"
  | "pastDate" | "futureDate" | "recentDate" | "pick" | "custom" | "ai"
  | "count" | "linkExisting" | "linkNew"
  | (string & {}); // forward-compat escape via @Mock({ kind, … })

export type MockMeta = {
  kind: MockKind;
  options?: Record<string, unknown>;
};

type FieldMetaMap = Record<string, MockMeta>;

/**
 * Write a mock-meta entry for the decorated field into the class's
 * metadata bag. Each field contributes exactly one `{ kind, options }` entry;
 * a subclass-level decorator overrides a parent's entry for the same field.
 *
 * @param kind - the `MockKind` to stash for the decorated field.
 * @param options - optional generator options, serialised verbatim in the metadata.
 * @returns a TC39 field decorator that records the meta on class metadata.
 */
function mark(kind: MockKind, options?: Record<string, unknown>) {
  return (_value: unknown, context: ClassFieldDecoratorContext) => {
    // Use own-property check so that a subclass field decorator does not mutate
    // the parent's shared metadata bag (TC39: Symbol.metadata is prototypally inherited).
    if (!Object.hasOwn(context.metadata, MOCK_META)) {
      const inherited = context.metadata[MOCK_META] as FieldMetaMap | undefined;
      context.metadata[MOCK_META] = inherited ? { ...inherited } : ({} as FieldMetaMap);
    }
    const bag = context.metadata[MOCK_META] as FieldMetaMap;
    bag[String(context.name)] = options === undefined ? { kind } : { kind, options };
  };
}

/* ─── Named scalar decorators ─────────────────────────────────────── */
export const Mock: {
  uuid: ReturnType<typeof mark>;
  email: ReturnType<typeof mark>;
  firstName: ReturnType<typeof mark>;
  lastName: ReturnType<typeof mark>;
  fullName: ReturnType<typeof mark>;
  phone: ReturnType<typeof mark>;
  url: ReturnType<typeof mark>;
  avatar: ReturnType<typeof mark>;
  word: ReturnType<typeof mark>;
  percentage: ReturnType<typeof mark>;
  recentDate: ReturnType<typeof mark>;
  linkExisting: ReturnType<typeof mark>;
  linkNew: ReturnType<typeof mark>;

  lorem(opts?: { sentences?: number; paragraphs?: number; words?: number }): ReturnType<typeof mark>;
  integer(opts?: { min?: number; max?: number }): ReturnType<typeof mark>;
  float(opts?: { min?: number; max?: number; precision?: number }): ReturnType<typeof mark>;
  pastDate(opts?: { within?: "day" | "week" | "month" | "year" }): ReturnType<typeof mark>;
  futureDate(opts?: { within?: "day" | "week" | "month" | "year" }): ReturnType<typeof mark>;
  pick<T>(values: readonly T[]): ReturnType<typeof mark>;
  custom(fn: (ctx: unknown) => unknown): ReturnType<typeof mark>;
  ai(opts: { prompt: string; maxTokens?: number }): ReturnType<typeof mark>;
  count(nOrRange: number | { min?: number; max?: number }): ReturnType<typeof mark>;

  (meta: MockMeta): ReturnType<typeof mark>; // forward-compat generic form
} = Object.assign(
  // The generic callable form: @Mock({ kind: "myKind", … })
  (meta: MockMeta) => mark(meta.kind, meta.options),
  {
    uuid: mark("uuid"),
    email: mark("email"),
    firstName: mark("firstName"),
    lastName: mark("lastName"),
    fullName: mark("fullName"),
    phone: mark("phone"),
    url: mark("url"),
    avatar: mark("avatar"),
    word: mark("word"),
    percentage: mark("percentage"),
    recentDate: mark("recentDate"),
    linkExisting: mark("linkExisting"),
    linkNew: mark("linkNew"),

    lorem: (opts?: { sentences?: number; paragraphs?: number; words?: number }) => mark("lorem", opts),
    integer: (opts?: { min?: number; max?: number }) => mark("integer", opts),
    float: (opts?: { min?: number; max?: number; precision?: number }) => mark("float", opts),
    pastDate: (opts?: { within?: "day" | "week" | "month" | "year" }) => mark("pastDate", opts),
    futureDate: (opts?: { within?: "day" | "week" | "month" | "year" }) => mark("futureDate", opts),
    pick: <T>(values: readonly T[]) => mark("pick", { values: values as readonly unknown[] }),
    custom: (fn: (ctx: unknown) => unknown) => mark("custom", { fn }),
    ai: (opts: { prompt: string; maxTokens?: number }) => mark("ai", opts),
    count: (nOrRange: number | { min?: number; max?: number }) => mark("count", typeof nOrRange === "number" ? { n: nOrRange } : nOrRange)
  }
);

/**
 * Read the mock-meta map for a model class. Merges entries from the class
 * and its prototype chain so a subclass's `@Mock.*` overrides the parent's.
 *
 * @param ctor - the model class constructor.
 * @returns the merged `fieldName → MockMeta` map across the prototype chain.
 */
export function readMockMeta(ctor: new (...args: unknown[]) => unknown): FieldMetaMap {
  const chain: Array<new (...args: unknown[]) => unknown> = [];
  let c: unknown = ctor;
  while (typeof c === "function" && c !== Object.prototype) {
    chain.push(c as new (...args: unknown[]) => unknown);
    c = Object.getPrototypeOf(c);
  }
  const result: FieldMetaMap = {};
  // Walk root-first so child classes overwrite parents.
  for (const klass of chain.reverse()) {
    const meta = (klass as unknown as { [Symbol.metadata]?: Record<string, unknown> })[Symbol.metadata];
    const bag = meta?.[MOCK_META] as FieldMetaMap | undefined;
    if (bag) Object.assign(result, bag);
  }
  return result;
}
