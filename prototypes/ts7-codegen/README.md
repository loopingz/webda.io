# TS7 codegen prototype

A working prototype of the re-architecture that makes Webda's accessor feature
work under **TypeScript 7** (the native Go port), where custom emit transformers,
`ts-patch` and language-service plugins have all ceased to exist.

Status: **prototype**. It covers the `accessors` transform end to end. It lives
outside the pnpm workspace globs, so it does not affect `pnpm install`.

---

## 2026-09-18 update — TypeScript shipped the mechanism. Read this first.

Everything below was written against `typescript@7.1.0-dev.20260826.1`. Re-checked
against `7.1.0-dev.20260918.1`, three weeks later, and **the central conclusion of
this document is now wrong**.

This README says, repeatedly, that the editor is unfixable — that tsgo has no
plugin loader, that the only recourse is an LSP proxy you own and maintain, and
that this pushes you toward in-place codegen. That was true on 08-26. It is not
true now.

TypeScript 7.1 added **content mappers** (`microsoft/typescript-go#4712`, finished
in `microsoft/TypeScript#63936`): a supported, external-process transform pipeline,
wired into `tsc`, the project system, `.tsbuildinfo`, *and the language server*.
It is the sanctioned successor to language-service plugins for exactly this class
of tool. It is the feature this prototype was hand-rolling.

### What it is

A mapper is a separate process speaking JSON-RPC over stdio. TypeScript drives it
with `initialize` / `openProject` / `transform` / `closeProject`; mappers never
initiate. Registration is a tsconfig option plus a `package.json` manifest:

```jsonc
// tsconfig.json
{
  "contentMappers": [
    { "package": "webda-content-mapper", "extensions": [".model.ts"], "options": { } }
  ]
}
```
```jsonc
// the mapper package's package.json
{ "typescript": { "contentMapper": { "exec": ["node", "server.js"],
                                     "compilerOptions": ["module"] } } }
```

`transform` returns the rewritten text plus a **span map** — a list of
`[virtualStart, virtualLength, originalStart, originalLength, kind, features?]`
tuples. This is precisely the per-line segment map that `inject-scan.ts` had to
invent (see *Column mapping: why a constant shift was not enough*), except it is
project-wide, it carries a `kind` (`Verbatim` / `Atom` / `Alias`) that controls
how diagnostic *text* is rendered, and a `features` bitmask that enables or
disables each LSP feature per span. There is also a `diagnosticDirectives`
channel for framework-scoped error suppression.

Trust-gated: `tsc --runExternalCode` on the CLI, and `initializationOptions.runExternalCode`
over LSP (VS Code sets it only in trusted workspaces — see
`packages/vscode-typescript/src/client.ts:117`). Note it is **not** an LSP CLI
flag; `tsc --lsp --runExternalCode` fails with `flag provided but not defined`.

### Verified here

`contentmapper/` is a working PoC: a ~90-line mapper that rewrites `x: Date;`
into an asymmetric accessor pair with verbatim span mappings for the indent,
identifier and type.

```sh
cd contentmapper
<tsgo> -p tsconfig.json --runExternalCode   # build/check
node lsp.mjs external                       # real LSP session
```

Build (`tsc --runExternalCode`), against a `.wts` model and a plain `.ts` consumer:

| | result |
|---|---|
| `u.createdAt = "2020-01-01"` in the consumer | **accepted** — the false TS2322 is gone, no plugin |
| `const bad: number = u.createdAt` | `TS2322: Type 'Date' is not assignable to type 'number'` — getter still narrow |
| a real error inside the model (`name: string = 42`) | reported at `src/user.model.ts(3,3)` — **exact original coordinates** |
| emitted `.d.ts` | `get createdAt(): Date; set createdAt(v: string \| number \| Date);` |

LSP session (`node lsp.mjs external`), mapper confirmed spawned by the server:

| request | raw | with mapper |
|---|---|---|
| diagnostics | 0 (file not in any project) | 1, at `2:2-6` — correct original range |
| hover on `createdAt` | none | **`(accessor) User.createdAt: Date`** |
| hover on `Date`, col 14 | none | **`interface Date …`** |

That second hover is the case the hand-rolled proxy got *wrong* and needed a
bespoke segment map to fix. Here it is free.

### Two limits that decide everything

**1. A mapper cannot claim `.ts`.** Verified:

```
tsconfig.json(12,22): error TS100021: Content mapper file extension '.ts' is a
built-in extension and cannot be registered by a content mapper.
```

Content mappers exist to bring *foreign* file types into a program (`.vue`,
`.svelte`, `.astro`). Webda authors plain TypeScript, so on the face of it the
feature does not apply.

**But compound suffixes are accepted.** `.model.ts`, `.webda.ts` and `.wts` all
pass validation (only `model.ts`, without the leading dot, is rejected — TS100020).
`.model.ts` was then verified end to end: the mapper is invoked, the transform is
applied, diagnostics map back correctly, and the file is imported with an ordinary
`nodenext` specifier (`./user.model.js`). Because the filename still *ends* in
`.ts`, eslint, prettier, vitest, bundlers and every editor's syntax highlighting
keep treating it as TypeScript. That is a genuine escape hatch and it is the
single most useful thing found in this pass.

**2. Mappers emit declarations, not JavaScript.** This is the blocker. For a
mapped input, `tsc` emits only a declaration file — and currently with a mangled
name:

```
lib/user.d.model.ts.ts        # .d.ts content is correct; the filename is not
lib/user.d.wts.ts
```

No `.js` at all. That is by design: in the Vue model, Vite compiles the component
and TypeScript only type-checks and emits types. Webda needs `tsc` to produce the
runtime JavaScript, so **content mappers cannot be Webda's build path.** The
naming is a known defect (`microsoft/TypeScript#64053`) with a fix in flight
(`#64120`, an `outputExtension` option); the absence of JS emit is not a defect.

### The hard part, built and measured

The open question was whether a mapper can do Webda's *typed* transforms at all.
`transform(fileName, content)` hands you one file's text and nothing else — no
`Program`, no `Checker` — but the dominant coercions (`ManyToOne<T>` ->
`ModelLink`, `OneToMany<T>` -> `ModelRelated`, `@WebdaAutoSetter` set-methods)
all need type resolution. The *Why not the scanner* section below already
measured why a syntactic mapper is not good enough: ~4 plain `Date` fields
against ~100 relation ones.

So the mapper runs **its own TypeScript program over the original sources and
keeps it warm** — pass 1 of the two-pass design, resident in the mapper process.
`src/mapper/{session,spans,server}.ts`, reusing the existing generators
unchanged.

Two findings, both found by getting it wrong first:

- **`APIOptions.fs` cannot carry the unsaved buffer.** Source files are cached,
  so the spawn-time `readFile` callback is consulted once and a later edit to the
  same path is never re-read. The supported route is a **filesystem layer**
  (`createFileSystemLayer`) passed to `snapshot.update`, which is checked ahead
  of the host filesystem.
- **`ensurePrograms: true` is required.** Programs update lazily. Without it the
  new snapshot hands back the *previous* program, and every transform silently
  analyses stale text — producing plausible, wrong output with no error anywhere.
  This cost an hour; it is the single easiest way to build something that looks
  like it works.

`.model.ts` degrading to plain TypeScript matters here too: the mapper opens the
project's own tsconfig without `runExternalCode`, so mappers are inert in its
resident program and recursion is impossible.

#### Measured

Bench: `contentmapper/bench`, 100 generated models / 165 files, each model
exercising all three coercion kinds plus cross-file relations, so the checker
resolves something on every transform. `node generate.mjs <n>` to resize.

```sh
cd contentmapper/bench
node session-probe.mjs                       # direct, no LSP
WEBDA_MAPPER_LOG=/tmp/m.log node typing-bench.mjs
```

Full build, `tsc --runExternalCode` — **0 diagnostics against the generated code**:

| | |
|---|---|
| wall clock | **320ms** |
| resident program startup | 35ms |
| 100 transforms | 188ms total, p50 **1.8ms** |

Editor, real LSP session, typing `deletedAt: Date;` one character at a time:

| | |
|---|---|
| cold open -> first diagnostics | 311ms |
| `didChange` -> diagnostics, end to end | p50 **5.6ms**, p95 7.6ms |
| mapper-internal transform | p50 3.1ms (snapshot 2.0 + analyze 1.2 + splice 0.01) |
| diagnostics on valid final text | 0 |
| hover on the just-typed field | **`(accessor) Entity042.deletedAt: Date`** |

That last row is the whole thing working: a property typed a few milliseconds
earlier, resolved through the checker, rewritten into an accessor, and reported
back on the authored text.

Scaling — only the edited file is re-analysed, so cost tracks program refresh,
not edit size:

| models | files | startup | keystroke transform |
|---:|---:|---:|---:|
| 25 | 90 | 30ms | 2.5ms |
| 100 | 165 | 37ms | 3.4ms |
| 400 | 465 | 43ms | 2.9ms |
| 800 | 865 | 76ms | 5.7ms |

**Verdict: latency is not the problem.** p95 under 8ms end to end is far inside
the budget; this was the risk that could have killed the approach, and it did not.

What the bench does *not* cover, and should before anyone commits to this:

- a synthetic fixture with a self-contained runtime. Real `@webda/core` has a far
  deeper import graph — the existing `realbench.mjs` measures its pass 1 at 91ms,
  so expect startup in the hundreds of milliseconds, not 35.
- **memory**: two full TypeScript programs are resident (tsgo's and the
  mapper's). Roughly double. Unmeasured.
- many files open and edited at once; invalidation storms from editing a shared
  file like `runtime.ts`; mapper memory growth over a long session.
- `snapshot` refresh (2.0ms) already dominates `analyze` (1.2ms), so the cost
  scales with project size rather than with the edit. That is the term to watch.

### What this changes

| | before this update | after |
|---|---|---|
| build | virtual FS injection via `APIOptions.fs`, two passes | unchanged, still the answer |
| editor | unsolvable; own an LSP proxy forever | **solved, officially — but only for non-`.ts` (incl. `.model.ts`) inputs, and it does not emit JS** |
| in-place codegen | the recommended target, because the editor was unfixable | still the recommended target, but now for a *weaker* reason |

So the honest position is: the editor argument that drove the in-place
recommendation has collapsed, but content mappers cannot replace the build, so a
single mechanism still does not cover both ends. The three end-states below stand,
with a fourth now possible:

**D. Content-mapped `.model.ts` for checking + codegen for emit.** Authors keep
clean sources and get a fully correct editor with no proxy to maintain; a codegen
or bundler step produces the JS. Now built and measured (above).

The drift risk is smaller than it first looks: the mapper and the two-pass build
call the *same* generators over the same plan model, so there is one
implementation with two hosts, not two implementations. What must be kept honest
is that both resolve the same files and config.

Remaining costs: a file-naming convention, a silent footgun if the suffix is
forgotten, `--runExternalCode` trust prompts, a resident mapper process, and
roughly double the memory. Against **B**, all of that buys exactly one thing —
authored source stays clean — because **B** gets a correct editor for free by
making the generated code real.

Worth tracking: `#64182` (let mappers return declarations instead of source) and
the 7.1 iteration plan `#63703`. If JS emit for mapped inputs ever lands, **D**
becomes strictly better than **B**.

---

## Two-pass PoC (start here)

`src/twopass.ts` is the current, correct implementation. Everything before it in
this README is earlier exploration, kept because the failures are instructive.

```sh
npm run demo:twopass          # generate + type-check the fixture
npm run demo:twopass:verify   # + emit and actually run it
npm run demo:twopass:real     # run against packages/{models,core,runtime}
```

### Why two passes

Injecting through the virtual filesystem is chicken-and-egg: `fs.readFile` must
return rewritten text, but deciding what to rewrite needs a `Program` +
`Checker` — the very thing being constructed.

```
pass 1   Program over the ORIGINAL sources   ->  run generators  ->  plan
pass 2   Program with fs.readFile injecting the plan  ->  check / emit
```

Nothing is written to disk and real file paths are preserved, so `nodenext`
module-format resolution behaves normally.

### Why not the scanner

The earlier `inject-scan.ts` was purely syntactic. Two things killed it:

1. **It hangs on real code.** A bare `scan()` loop cannot traverse template
   literals; on `packages/core/src/rest/restoperationstransport.ts` it hit `#`
   inside `` `#/components/schemas/${x}` ``, emitted a zero-width
   `PrivateIdentifier`, and spun forever. A stall guard now bails out, but 55 of
   core's 96 files contain backticks and would be silently skipped.
2. **It covers the wrong case.** Measured in the repo: ~4 plain `x: Date;`
   declarations, versus ~100 `ModelLink` / `ModelRelated` / `OneToMany` /
   `ManyToOne` ones. The common case needs alias resolution through the checker,
   which a tokenizer cannot do.

### Generators

Pluggable, mirroring how `morpher.ts` composes its modules, so the remaining
features can be ported one at a time.

| generator | replaces | status |
|---|---|---|
| `accessors` | `createAccessorTransformer` + declaration variant | all 3 coercion kinds |
| `loadParameters` | `morpher/loadparameters.ts` | done |
| `unserialize`, `capabilities`, `behaviors`, WQL rewrite | morpher / ts-plugin | not implemented |

`accessors` handles every kind the production transform does:

| kind | trigger | generated |
|---|---|---|
| `builtin` | type name in registry (`Date`) | asymmetric accessor pair |
| `set-method` | type has `@WebdaAutoSetter` `set(...)` | asymmetric accessor pair |
| `relation-initializer` | type resolves to `ModelRelated` | `readonly x = new ModelRelated()` |

Alias resolution works: `ManyToOne<User>` resolves to `ModelLink`, and
`OneToMany<Comment>` to `ModelRelated`.

### Results

Fixture (`fixture2`) — all kinds, emitted by plain tsgo with no transformer, then
executed:

```
Date coercion   -> true 2020-01-01T00:00:00.000Z
ModelLink coerce-> true user-123
ModelLink direct-> true
relation init   -> true
existing getter -> hello world
loadParameters  -> true https://x 7
```

Real packages — **0 diagnostics against the generated code**:

| package | edits | pass 1 | pass 2 | total | TS6 1-pass | speedup |
|---|---|---:|---:|---:|---:|---:|
| core | 2 accessors + 17 loadParameters | 74ms | 203ms | **277ms** | 1776ms | **6.4x** |
| models | 0 | 48ms | 77ms | 124ms | 1021ms | 8.2x |
| runtime | 0 | 48ms | 95ms | 143ms | 1079ms | 7.6x |

So two passes still beat TS6's *single* pass by 6-8x. Correctness is affordable.

### Bugs this found in its own output

Running against `packages/core` produced **24 diagnostics** at first. All were
generator bugs, now fixed by guards:

- **TS2693 x17** — `class Svc<T> extends Service<T>` generated `new T()`. Fixed
  by falling back to the type parameter's default, then its constraint (what
  `morpher/loadparameters.ts` does via `getDefault()`/`getConstraint()`).
- **TS2304 / TS2349 x6** — parameters type not in scope as a value, or lacking
  `load`. Fixed with a `resolveName` + `getPropertyOfType` check.
- **TS2554 x1** — `new ModelLink()`, but the real `ModelLink<T>` requires
  `constructor(model: ModelClass<T>)` (`packages/models/src/relations.ts:58`).
  Fixed with a zero-arg-constructible check.

The guards **skip** rather than emit invalid code, so a class the generator
cannot handle simply keeps today's behaviour.

### Known gaps

- `relation-initializer` and `set-method` are skipped when the runtime class
  needs constructor arguments. The production transform resolves the type
  argument and emits `new ModelLink(Target)`; that is the main missing piece,
  and it is why `core` yields only 2 accessor edits rather than ~100.
- No import insertion for generated references (`getImportAdderEdits` in TS 7.1
  is the right tool).
- `unserialize`, `capabilities`, `behaviors` and the WQL rewrite are not ported.
- The LSP proxy still uses the scanner; wiring it to this typed plan is the
  remaining integration.

## Prior art in this repo — read this first

**`packages/compiler/src/morpher/accessors.ts` already does the accessor
generation this prototype performs.** Same widened type
(`setterType: "string | number | Date"`, line 19), same `WEBDA_STORAGE`
routing, same asymmetric getter/setter pair (see its doc comment, lines 90-91).
It runs in-place via `webdac code`, using ts-morph.

So "in-place codegen" is not a new architecture being proposed here — it already
ships. What this prototype adds is narrower than it first appears:

1. an analyzer built on the **TS7 native API** rather than ts-morph (which
   vendors its own TypeScript 5.9.2 and so pins you to a JS TypeScript forever);
2. a **build wrapper** (`src/build.ts`) that makes codegen invisible at compile
   time — note `webdac build` already declares a `--code` / `-c` "Prerun code
   before compiling" option in `shell.ts:136-139`, but `argv.code` is never read
   anywhere, so the option currently does nothing;
3. an **LSP middleware** (`src/lsp-proxy.ts`) replacing the plugin.

The accessor *generation* itself was already solved.

## The core insight

Today `createAccessorTransformer` synthesises this at **emit** time:

```ts
// .js
get createdAt() { return this[WEBDA_STORAGE]["createdAt"]; }
set createdAt(value) { this[WEBDA_STORAGE]["createdAt"] = value != null ? new Date(value) : value; }

// .d.ts  (via createDeclarationAccessorTransformer)
get createdAt(): Date;
set createdAt(value: string | number | Date);
```

That `.d.ts` shape is an **asymmetric accessor** — and asymmetric accessors have
been legal TypeScript *source* since 4.3.

So the entire apparatus exists to synthesise, at emit time, something you are
allowed to simply write down. Write it in the source instead and:

- any compiler (tsc 6, **tsgo 7**, esbuild, swc, babel) emits the correct `.js`
- any compiler emits the correct `.d.ts`, with no `afterDeclarations` hook
- the false `TS2322` errors vanish, because the setter *genuinely* accepts the
  wide type — so the **language-service plugin is no longer needed**
- `ts-patch` is no longer needed

Verified: plain `tsgo` 7.0.2 emits a `.d.ts` byte-identical to the one the
current `afterDeclarations` transformer produces.

## Pipeline

```
src/*.ts  ──[webda-codegen]──►  <generated>  ──[tsgo | tsc | esbuild]──►  lib/
```

The codegen only ever *reads* the type graph and *writes* text. It never
participates in emit. That is what makes everything downstream interchangeable.

## What's here

| File | Role |
|---|---|
| `src/analyzer.ts` | Analysis via the TS7 `typescript/unstable/*` API. Replaces `computeCoercibleFields`. |
| `src/rewriter.ts` | Text-splicing rewrite into asymmetric accessors. Replaces both accessor transformers. |
| `src/index.ts` | Orchestration (`run`). |
| `src/cli.ts` | `webda-codegen --project … --rootDir … --outDir …` |
| `fixture/` | Self-contained fixture exercising both coercion paths. |

The tool is itself **built by tsgo 7**, using only the supported TS7 API
(`API`, `Project`, `Checker`, `unstable/ast`, `unstable/ast/is`).

## Try it

```sh
npm install
npx tsc -p tsconfig.json          # build the tool with tsgo 7
npm run demo                      # generate into fixture/.webda/gen
npx tsc -p fixture/.webda/tsconfig.gen.json   # compile generated source, no plugins
node fixture/lib/verify.js
```

## Verified behaviour

Input (author-written):

```ts
export class User extends Model {
  name: string = "";
  createdAt: Date;          // builtin coercion
  mfa: MFA;                 // @WebdaAutoSetter coercion
  static epoch: Date;       // skipped
  get displayName(): string { return this.name.toUpperCase(); }  // untouched
}
export class Service { startedAt: Date; }   // non-model, untouched
```

Emitted `.d.ts` from **plain tsgo 7**:

```ts
export declare class User extends Model {
    name: string;
    get createdAt(): Date;
    set createdAt(value: string | number | Date);
    get mfa(): MFA;
    set mfa(value: string | MFA);
    static epoch: Date;
    get displayName(): string;
    toJSON(): Record<string, any>;
}
```

Runtime:

```
string -> true 2020-01-01T00:00:00.000Z
number -> 2020-01-01T00:00:00.000Z
mfa    -> true s3cret
display-> ADA
toJSON -> {"name":"ada","createdAt":"2020-01-01T00:00:00.000Z","mfa":{"secret":"s3cret"}}
```

Also verified:

- **Idempotent** — a second pass is a no-op (properties that already have
  accessors are skipped), which is what makes in-place mode safe.
- **Import merging** — `WEBDA_STORAGE` is merged into an existing import of the
  same module rather than duplicating it.
- **Comment preservation** — rewriting is text splicing, not AST printing, so
  JSDoc and formatting survive byte-for-byte.

## The wrapper (`webda-build`) — codegen at compile time, invisible

`src/build.ts` restores the original ergonomics: the author writes
`createdAt: Date` and never sees generated code.

```sh
node lib/build-cli.js --project fixture/tsconfig.json --storageModule ./models.js
```

```
src/*.ts ──[codegen]──► <tmpdir>/gen/*.ts ──[tsgo]──► lib/*.js + lib/*.d.ts
                                                       └── sourcemaps → src/
```

Verified:

- `src/user.ts` is **byte-for-byte unchanged** after a build
- `lib/user.d.ts` contains the asymmetric accessors
- source maps are rewritten to point at `../src/user.ts`, not the temp dir
- the intermediate directory is deleted (`--keep` retains it for debugging)
- compiled entirely by **tsgo 7** — no transformer, no `ts-patch`, no plugin

> **Gotcha found while building this.** The intermediate tree must live *inside*
> the package (`<pkg>/.webda/build`), not in the OS temp dir. Under `nodenext`,
> module format is decided by the nearest `package.json` `type` field. A temp
> directory has none, so the generated ESM was silently resolved as CommonJS and
> the emitted `lib/*.js` was wrong — `SyntaxError: does not provide an export
> named 'User'` at runtime, with a completely clean compile. Any wrapper design
> has to account for this.

**So the build side is fully solved.** `webdac build` becomes: codegen → tsgo.

## Better than the wrapper: inject through the virtual filesystem

`src/build.ts` writes generated files to `<pkg>/.webda/build` and shells out to
`tsc`. That works, but it is not the best mechanism available.

`APIOptions.fs` (present in **7.0** and 7.1) accepts virtual-filesystem
callbacks:

```ts
readFile?: (fileName: string) => string | null | undefined;  // undefined = fall through to real FS
writeFile?: (path: string, content: string) => void;
```

So the generated source can be served **straight to the compiler, never touching
disk**:

```ts
const api = new API({ cwd: root, fs: {
  readFile:  f => isModelFile(f) ? generate(f) : undefined,
  writeFile: (p, c) => { emitted[p] = c; }
}});
const program = api.updateSnapshot({ openProjects: [tsconfig] }).getProjects()[0].program;
program.getSemanticDiagnostics();   // checked against generated text
program.emit();                     // output captured via writeFile
```

Verified, with controls:

| | diagnostics | note |
|---|---|---|
| no injection (real disk) | 1 × TS2322 | authored `createdAt: Date` rejects a wide write |
| inject *deliberately broken* text | 1 × **TS2304** at `src/user.ts` | an error impossible from the on-disk file — proves injected text is what gets checked |
| inject generated accessors | **0** | emits `lib/user.d.ts` with the asymmetric accessor pair |

Why this beats the temp-directory wrapper:

- no intermediate directory, no cleanup
- **files keep their real paths**, so module resolution and the `nodenext`
  package.json `type` lookup behave normally — this removes the CommonJS/ESM
  trap documented above entirely
- emitted sourcemap `sources` already point at `../src/user.ts`; no remapping

Caveats:

- **`Program.emit()` is 7.1-only.** The `fs` option itself works in 7.0, so
  injection-for-*analysis* works today; injection-for-*emit* needs 7.1.
- Sourcemap **mappings** describe the injected text, so debugger line positions
  drift. Generating accessors line-aligned with the property they replace keeps
  this to near zero; otherwise post-process the map.
- `runWithTemporaryFileUpdate(snapshot, file, newText, cb)` is the *single-file*
  variant. Useful for validating generated output before committing to it, but
  the `fs` callbacks are the right tool for a whole-project build.

## The editor problem — the part a wrapper cannot fix

> **Superseded.** See *2026-09-18 update* at the top. TypeScript 7.1 content
> mappers fix the language server officially, for non-`.ts` (including
> `.model.ts`) inputs. Everything in this section about hand-rolling an LSP
> proxy is now only of historical interest — but the *analysis* of what the
> proxy had to do (span mapping, feature coverage, full sync) maps one-to-one
> onto what the content mapper protocol asks you to supply, so it is still the
> best explanation of why that protocol looks the way it does.

The wrapper fixes compilation. It does not fix the language server, because
while editing `src/` the server reads what the author actually wrote:

```
$ tsc -p tsconfig.json --noEmit          # tsgo 7
src/editing.ts(3,1): error TS2322: Type 'string' is not assignable to type 'Date'.
```

That is exactly what `@webda/ts-plugin` suppresses today. And under TS7 it cannot
be suppressed the same way — confirmed empirically:

- the tsgo binary contains **no plugin-loading machinery whatsoever**
  (no `PluginModule`, no `loadPlugin`, no `PluginCreateInfo`)
- a `"plugins": [{ "name": "@webda/ts-plugin" }]` entry in tsconfig is silently
  ignored and TS2322 is still reported

### But the blast radius is much smaller than it looks

Downstream packages consume the **built `.d.ts`**, which carries the real
asymmetric accessors. Verified: a separate package importing the built output
type-checks wide assignments cleanly under tsgo 7 with no plugin at all.

So the lie is only needed **inside the package being authored** — not for any
consumer. `@webda/runtime` editing against `@webda/core`'s published types is
already fine. Only editing `@webda/core`'s own `src/` hits TS2322.

### Injecting LSP middleware (`src/lsp-inject.ts`) — the good one

Two proxies are included. `src/lsp-proxy.ts` *filters* the false TS2322 out of
diagnostics. `src/lsp-inject.ts` instead **rewrites the document text on its way
to the server**, so the server type-checks the generated accessors directly.

Injection is strictly better: correctness comes for free across every LSP
method, rather than each one needing a bespoke override. The proof is in the
hover text — it changes from `(property)` to `(accessor)`, meaning the server's
own view is correct.

Three properties make this cheap:

1. **Line-aligned generation.** `inject-scan.ts` emits the accessor pair on a
   *single line*, replacing a single-line property declaration, and appends the
   `WEBDA_STORAGE` import to the end of line 0. Line count and every existing
   column outside rewritten lines are preserved, so **no line mapping is needed
   anywhere** — only columns on rewritten lines shift, by a constant `"get ".length`.
2. **Scanner, not regex.** Detection uses `typescript/unstable/ast/scanner`, a
   real tokenizer, tracking brace depth and `extends` to find plain property
   declarations in model classes. Statics, existing accessors, methods,
   initialisers and non-model classes are all skipped.
3. **Forced full sync.** The proxy rewrites the server's advertised
   `textDocumentSync.change` from `2` (Incremental) to `1` (Full), so it always
   receives whole-document text and never has to reimplement a document model.

#### Measured, against a real LSP session

`npm run demo:lsp` — a consumer file (`editing.ts`) with two wide writes, one
genuine type error and one unused variable:

| | raw tsgo | injecting proxy |
|---|---|---|
| `textDocumentSync.change` | `2` (Incremental) | `1` (Full) |
| diagnostics | 4 | **2** |
| line 2 `TS2322 … type 'Date'` | reported | **suppressed** |
| line 3 `TS2322 … type 'Date'` | reported | **suppressed** |
| line 4 `TS2322 … type 'number'` | reported | **preserved, correct line** |
| line 4 `TS6133` unused | reported | **preserved, correct line** |
| hover | `(property) User.createdAt: Date` | `(accessor) User.createdAt: Date` |

`npm run demo:lsp:model` — editing the model file itself, which is the hard case
because those are the rewritten lines:

| | raw tsgo | injecting proxy |
|---|---|---|
| unrelated error position | line 7, col 21-27 | **line 7, col 21-27** (identical) |
| hover range on the declaration | `3:2 → 3:11` | **`3:2 → 3:11`** (identical) |
| completion items | 7 | 7 |

`npm run demo:lsp:edit` — live typing. After a `didChange` that adds
`deletedAt: Date;`, hover on the newly typed field immediately returns
`(accessor) User.deletedAt: Date`, and the pre-existing error correctly tracks
from line 7 to line 8.

#### Column mapping: why a constant shift was not enough

The first version shifted columns on rewritten lines by a constant
`"get ".length` (4). That is correct for the property *identifier* and wrong for
everything else:

```
authored   0....+....1....+....
             createdAt: Date;
             ^col 2          identifier 2..11,  type 13..17

generated  0....+....1....+....2....+....
             get createdAt(): Date { return this[…
                 ^col 6              ^col 19      identifier shift +4, type shift +6
```

The observable bug: hovering `Date` at column 14 mapped to column 18, which is
the space before `Date`, so the server returned nothing.

| hover, line 3 | raw tsgo | constant shift | segment map |
|---|---|---|---|
| col 4 — identifier | `(property) User.createdAt: Date` | `(accessor) …` ✓ | `(accessor) …` ✓ |
| col 14 — type `Date` | `interface Date …` | **(none)** ✗ | `interface Date …` ✓ |

Fixed by replacing the constant with a per-line **segment map** — a list of
`{aStart, aEnd, iStart, iEnd}` spans recorded at generation time, since the
generator knows exactly where each authored token lands. `mapForward` and
`mapBack` in `inject-scan.ts` look up the containing segment; anything falling
inside generated-only text collapses onto the declaration, which is the sensible
behaviour for a diagnostic raised inside a synthesised setter body.

#### Multi-line declarations: why they are skipped

The entire design rests on line-count preservation — that is what removes the
need for line mapping. `inject()` therefore only rewrites declarations whose
start and end are on the same line:

```ts
const usable = sites.filter(s => lineOf(text, s.start) === lineOf(text, s.end));
```

Given this input, the scanner finds **both** fields but only one is rewritten:

```
 0| import { Model } from "./models.js"; import { WEBDA_STORAGE } from "./mo…
 1| export class User extends Model {
 2|   get createdAt(): Date { return this[WEBDA_STORAGE]["createdAt"]; } set…   <- rewritten
 3|   updatedAt:
 4|     Date;                                                                   <- skipped
 5|   name: string;
```

Collapsing lines 3-4 into one would shrink the file by a line, and every
diagnostic below it would then report one line too high. Skipping degrades to
today's behaviour instead: `updatedAt` keeps showing the false TS2322.

This is fixable — pad the replacement with `\n` to match the original span's
line count, putting the accessors on the first line and leaving the rest blank.
Not implemented here. In practice it is rare for the builtin coercions, because
the scanner already disqualifies anything containing generics, unions,
initialisers or decorators.

#### Remaining gaps

- Only builtin (registry) coercions. The `@WebdaAutoSetter` and
  `relation-initializer` kinds need type resolution, which is too expensive on
  the keystroke path — they want a cached analysis (or a build-time manifest)
  rather than the scanner.
- Multi-line declarations, as above.
- Not exercised: rename, go-to-definition across a rewritten line, code actions,
  semantic tokens.

### Why VS Code can load this at all

`src/lsp-proxy.ts` is the simpler, filtering variant, kept for comparison.

**Verified against a real LSP session** (`lsp-harness.mjs`):

```
mode=RAW tsgo   diagnostics=3
   TS2322: Type 'string' is not assignable to type 'Date.'     <- false positive
   TS2322: Type 'string' is not assignable to type 'number'.   <- real error
   TS6133: 'oops' is declared but its value is never read.     <- real error

mode=PROXY      diagnostics=2
   TS2322: Type 'string' is not assignable to type 'number'.   <- preserved
   TS6133: 'oops' is declared but its value is never read.     <- preserved
```

The false `Date` positive is suppressed; genuine errors survive. This is exactly
`getSemanticDiagnostics` from `packages/ts-plugin/src/index.ts:208`, over LSP.

#### VS Code *does* support this — no forking required

Reading the extension source settles it:

- `_extension/src/util.ts:48` — `const packagedExeBaseNames = ["tsc", "tsgo"];`
- `_extension/src/util.ts:347-351` — if the configured tsdk directory contains
  an executable named `tsc` or `tsgo`, it is used directly
  (`version: "(local)"`, `isLocal: true`). No package.json, no signature check.
- `_extension/src/client.ts:233-243` — it is spawned as
  `args: ["--lsp", ...], transport: TransportKind.stdio` (which appends
  `--stdio`).
- `_extension/src/util.ts:220-223` — tsdk config sources, in priority order:
  `js/ts.tsdk.path`, `typescript.tsdk`, `typescript.native-preview.tsdk`.

So installing middleware is: drop an executable named `tsgo` in a directory and
point `js/ts.tsdk.path` at it. See `tsdk/tsgo` in this prototype — verified by
spawning it exactly as VS Code does (`<tsdk>/tsgo --lsp --stdio`).

```jsonc
// .vscode/settings.json
{ "js/ts.tsdk.path": "prototypes/ts7-codegen/tsdk" }
```

Note this repo **already uses this exact setting** — `.vscode/settings.json`
currently sets `js/ts.tsdk.path` to `node_modules/typescript/lib` to load the
present-day plugin. The mechanism is the same one, not a new dependency.

#### Caveats, honestly

- **Pull diagnostics, not push.** VS Code requests `textDocument/diagnostic`
  rather than receiving `textDocument/publishDiagnostics`, so the proxy must
  correlate responses to request ids and also walk `relatedDocuments`. The
  first version of this proxy only handled push and silently did nothing.
- **Workspace trust.** `util.ts:196-205` — a workspace-level tsdk requires
  workspace trust plus a one-time explicit opt-in prompt per developer. Same
  friction as today's `typescript.tsdk`.
- **Message-text matching is a placeholder.** The prototype matches
  `is not assignable to type 'Date'`. A real implementation should key off the
  same (file, position) analysis the codegen uses, not the message string.
- **You own it.** Every LSP method that should reflect the widened type — hover,
  completion details, signature help — needs handling, and tracks LSP evolution.

## Three coherent end-states

| | Authored source | Build | Editor | Ongoing cost |
|---|---|---|---|---|
| **A. Wrapper + LSP middleware** | clean (`createdAt: Date`) | wrapper, works today | needs an LSP proxy you own | highest; VS Code uncertain |
| **B. In-place codegen** | contains generated accessors | plain `tsc`/`tsgo` | nothing needed, correct natively | lowest |
| **C. Narrow the API** | clean | plain `tsc`/`tsgo` | nothing needed | none tooling; costs an API change |

**C** deserves consideration: the dominant use of coercion is *hydration* from
stored JSON, not hand-written `u.createdAt = "2020-01-01"`. If hydration runs
through an explicitly wide-typed path (a factory, `fromJSON`, or a typed `set()`),
then `createdAt: Date` stays honest, and both the codegen and the plugin
disappear entirely.

## In-place vs generated directory — an important finding

Two output modes are possible, and they are **not** equivalent for DX:

**Generated directory** (`--outDir .webda/gen`). Type-checking the *authored*
`src/` still reports the old false errors:

```
src/verify.ts(4,1): error TS2322: Type 'string' is not assignable to type 'Date'.
```

That is precisely the problem the language-service plugin was invented to hide —
so this mode still needs a plugin, which TS7 cannot load. **Dead end for DX.**

**In-place** (`--outDir` == `--rootDir`). The authored source *is* the generated
source, so the editor sees real asymmetric accessors:

```
$ tsc -p tsconfig.json --noEmit     # tsgo 7, no plugin, no transformer
exit=0
```

Zero errors, correct hover types, correct go-to-definition — with no plugin.

**Conclusion: in-place codegen is the correct target architecture.** It is also
the mode the repo already has machinery for: `webdac code` /
`packages/compiler/src/morpher/`. The trade-off is that generated code becomes
part of the committed source, which is a real change in workflow but removes an
entire category of tooling.

## TypeScript 7.1 (nightly) — checked, and it matters

> Re-measured against `7.1.0-dev.20260918.1`; see the update at the top. The API
> churned hard in three weeks (`updateSnapshot` replaced per `#64204`, most
> methods gained `.gen()` generator forms for batching, `project.languageService`
> promoted to a first-class class). Pin a nightly if you build on this.

Measured against `typescript@7.1.0-dev.20260826.1`:

**Not restored, and almost certainly never will be:**

- package exports are byte-identical to 7.0 — main entry is still `lib/version.cjs`
- `createProgram` / `factory` / `transform` / `server` still absent from `typescript`
- **zero** `TransformerFactory` / `CustomTransformer` anywhere in `dist/`
- **zero** plugin-loading machinery in the tsgo binary
- `emit(emitOnly?: EmitOnly)` takes **no transformers parameter**

**But the API grew substantially — 196 → 246 members, nothing removed.** And the
additions are precisely what a source-generating tool needs:

| Added in 7.1 | Why it matters here |
|---|---|
| `formatNodeForInsertion(node, file, position)` | Build a node with `unstable/ast/factory`, get it back formatted and indented for a position. Replaces the hand-rolled `indentAt()` in `src/rewriter.ts`. |
| `getImportAdderEdits`, `getImportEditsForSymbols` | Proper import insertion/merging. Replaces the ad-hoc `WEBDA_STORAGE` splicing in `src/rewriter.ts`. |
| `runWithTemporaryFileUpdate(snap, file, newText, cb)` | Re-analyse generated text **without writing to disk** — generate, verify, iterate in memory. |
| `emit`, `emitToString`, `getJavaScriptEmit`, `getDeclarationEmit` | Drive emit from the API instead of shelling out to `tsc`. Simplifies `src/build.ts`. |
| `transpileModule`, `transpileDeclaration` (+ `FromFile`) | A supported path for what `@webda/tsc-esm` does. |
| `parseCommandLine`, `readConfigFile`, `parseJsonConfigFileContent` | Exactly the calls in `compiler/src/config/tsconfig-loader.ts` and `definition.ts`. |
| `getProperties`, `getCallSignatures`, `getConstructSignatures`, `getIndexInfos`, `getStringIndexType`, `getNumberIndexType`, `getReducedType`, `getFullyQualifiedName` | Public replacements for much of what `@webda/schema` currently reaches into privately. |
| `project.languageService` | Language-service surface (completions, references, import edits) as a first-class handle. |

**Read the direction, not just the diff.** Microsoft is not reinstating
transformers — it is building out *analyse → generate source → emit*. That is
the same architecture this prototype implements, which is reassuring, but it
also means the emit-time approach is permanently gone rather than temporarily
unavailable.

## Migration path for the remaining transforms

| Transform | Path | Difficulty |
|---|---|---|
| `accessors` | **Done here.** Asymmetric accessors in source. | done |
| `behaviors` | Same technique — `parent` getter, `toJSON`, `__hydrateBehaviors` are all expressible as ordinary source members. | low |
| `module-generator` | Already only a *side effect* (`afterDeclarations` that writes `webda.module.json`); it emits no code. Becomes a standalone analysis pass over the same TS7 `Program`. | low |
| `qlvalidator` | Two halves. The **validation** half is pure analysis → straightforward. The **rewrite** half (template literal → `escape()` call) needs codegen, but is local and mechanical. | medium |
| `@webda/schema` | Hardest. Leans on `createLanguageService` plus internals (`objectFlags`, `elementFlags`, `intrinsicName`, `checker.getTypeOfPropertyOfType`, `checker.isArrayType`). TS7's `Checker` exposes public equivalents for most (`getPropertyOfType`, `isArrayType`, `isTupleType`, `getBaseTypes`, `ObjectFlags`, `ElementFlags` are all exported) — so this is a real port, not a blocker. | high |
| `@webda/tsc-esm` | The `emit(undefined, writer)` hook has no TS7 equivalent. Options: `rewriteRelativeImportExtensions` covers the original use case natively (used by this prototype's tsconfig); or, on 7.1, `transpileModule`/`emitToString` give a supported path. | low-medium |
| `@webda/ts-plugin` LS plugin | **Delete.** Made redundant by the above — its only jobs were widening hover types and suppressing TS2322, both of which stop being necessary once the accessors are real. | n/a |
| `ts-patch` | **Delete.** No longer used. | n/a |

## Known gaps in this prototype

- Only `builtin` and `set-method` coercions. The third kind,
  `relation-initializer` (`ModelRelated` / `OneToMany`), is not implemented.
- No source maps back to pre-generation source. Irrelevant in in-place mode
  (recommended), required for generated-directory mode.
- `toJSON` generation assumes the model base declares `toJSON()`. The current
  transform emits a `super.toJSON ? … : {}` runtime guard, which cannot be
  written in typed source without tripping TS2774; requiring the base method is
  the cleaner contract.
- No incremental/watch mode. The TS7 `API` supports snapshots and `fileChanges`,
  so this is a straightforward addition.
- Single project per invocation; no project-references traversal.
