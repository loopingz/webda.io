import React, { useCallback, useState } from "react";
import Layout from "@theme/Layout";
import {
  commit as makeCommit,
  diff,
  merge3,
  renderPatch,
  resolve,
  type Conflict,
  type Delta,
  type MergeResult,
  type Path,
  type Resolution,
  type VersionedPatch
} from "@webda/versioning";
import styles from "./versioning-demo.module.css";

type Obj = { title: string; body: string; tags: string[] };
type User = "user1" | "user2";

const DEFAULT_BASE: Obj = {
  title: "draft",
  body: "line 1\nline 2\nline 3\n",
  tags: ["draft"]
};

const USER_LABELS: Record<User, string> = {
  user1: "User 1",
  user2: "User 2"
};

function DiffView({ text }: { text: string }): React.JSX.Element {
  if (!text) return <></>;
  const lines = text.split("\n");
  return (
    <pre className={styles.diff}>
      {lines.map((line, i) => {
        let cls = styles["diffLine"];
        if (line.startsWith("---") || line.startsWith("+++")) cls = styles["diffLine--header"];
        else if (line.startsWith("@@")) cls = styles["diffLine--hunk"];
        else if (line.startsWith("+")) cls = styles["diffLine--add"];
        else if (line.startsWith("-")) cls = styles["diffLine--del"];
        return (
          <span key={i} className={cls}>
            {line}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

function AppliedPanel({
  base,
  applied
}: {
  base: Obj;
  applied: Obj;
}): React.JSX.Element {
  const diffText = renderPatch(base, diff(base, applied), {
    fromLabel: "base",
    toLabel: "applied",
    sortKeys: true
  });
  return (
    <div className={styles.appliedPanel}>
      <h2>Applied state</h2>
      {diffText ? <DiffView text={diffText} /> : <p className={styles.empty}>applied === base</p>}
    </div>
  );
}

type OpenConflict = {
  patchId: string;
  result: MergeResult<Obj>;
  choices: Map<Path, Resolution>;
};

function renderValueSnippet(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v, null, 2);
}

function parseCustom(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function ConflictDialog({
  open,
  onCancel,
  onApplyResolutions
}: {
  open: OpenConflict;
  onCancel: () => void;
  onApplyResolutions: (choices: Map<Path, Resolution>) => void;
}): React.JSX.Element {
  const [choices, setChoices] = useState<Map<Path, Resolution>>(open.choices);

  const setChoice = (path: Path, r: Resolution) => {
    setChoices((prev) => {
      const next = new Map(prev);
      next.set(path, r);
      return next;
    });
  };

  // Seed a fallback "ours" choice for any line-kind conflicts so the dialog
  // remains dismissable even before Task 8 introduces the real editor.
  React.useEffect(() => {
    for (const c of open.result.conflicts) {
      if (c.kind === "line" && !choices.has(c.path)) {
        setChoice(c.path, { choose: "ours" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canApply = open.result.conflicts.every((c) => choices.has(c.path));

  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <h2>Resolve conflicts</h2>
        {open.result.conflicts.map((c: Conflict) => (
          <div key={c.path} className={styles.conflict}>
            <div className={styles.conflictPath}>
              <strong>{c.path}</strong> &nbsp; <em>kind: {c.kind}</em>
            </div>

            {c.kind === "line" ? (
              <p className={styles.empty}>
                Line-kind conflicts are handled in a separate pane (Task 8).
                For now, this entry auto-resolves to "ours".
              </p>
            ) : (
              <>
                <div className={styles.conflictCols}>
                  {(["base", "ours", "theirs"] as const).map((side) => {
                    const value = side === "base" ? c.base : side === "ours" ? c.ours : c.theirs;
                    const id = `${c.path}:${side}`;
                    return (
                      <div key={side} className={styles.conflictCol}>
                        <label>
                          <input
                            type="radio"
                            name={c.path}
                            id={id}
                            checked={
                              (choices.get(c.path) as { choose?: string } | undefined)?.choose === side
                            }
                            onChange={() => setChoice(c.path, { choose: side })}
                          />
                          {side}
                        </label>
                        <pre className={styles.yaml}>{renderValueSnippet(value)}</pre>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.conflictCustom}>
                  <label>
                    Custom (JSON or plain string):{" "}
                    <input
                      type="text"
                      placeholder='e.g. "hello" or 42 or ["a","b"]'
                      onChange={(e) => setChoice(c.path, { value: parseCustom(e.target.value) })}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        ))}

        <div className={styles.dialogActions}>
          <button className={styles.btn} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.btn}
            disabled={!canApply}
            onClick={() => onApplyResolutions(choices)}
          >
            Apply resolutions
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorForm({
  value,
  onChange
}: {
  value: Obj;
  onChange: (next: Obj) => void;
}): React.JSX.Element {
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (value.tags.includes(t)) {
      setTagInput("");
      return;
    }
    onChange({ ...value, tags: [...value.tags, t] });
    setTagInput("");
  };

  const removeTag = (t: string) => {
    onChange({ ...value, tags: value.tags.filter((x) => x !== t) });
  };

  return (
    <>
      <div className={styles.field}>
        <label>Title</label>
        <input
          type="text"
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </div>

      <div className={styles.field}>
        <label>Body</label>
        <textarea
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
        />
      </div>

      <div className={styles.field}>
        <label>Tags</label>
        <div className={styles.tagsRow}>
          {value.tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => removeTag(t)}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className={styles.tagInput}
            type="text"
            placeholder="+ new tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        </div>
      </div>
    </>
  );
}

function EditorTabs({
  active,
  onChange,
  drafts,
  onDraftChange
}: {
  active: User;
  onChange: (u: User) => void;
  drafts: Record<User, Obj>;
  onDraftChange: (u: User, next: Obj) => void;
}): React.JSX.Element {
  return (
    <>
      <div className={styles.tabs} role="tablist">
        {(Object.keys(USER_LABELS) as User[]).map((u) => (
          <button
            key={u}
            role="tab"
            aria-selected={active === u}
            data-active={active === u}
            className={styles.tab}
            onClick={() => onChange(u)}
          >
            {USER_LABELS[u]}
          </button>
        ))}
      </div>
      <EditorForm
        value={drafts[active]}
        onChange={(next) => onDraftChange(active, next)}
      />
    </>
  );
}

const TITLE_POOL = ["draft", "proposal", "spec v0.1", "rough idea", "outline"];
const BODY_SUFFIX_POOL = [
  "line 1\nline 2\nline 3\n",
  "line 1\nline 2\nline 3\nline 4\n",
  "Alpha\nBeta\nGamma\n",
  "One.\nTwo.\nThree.\n",
  "The quick brown\nfox jumps over\nthe lazy dog.\n"
];
const TAGS_POOL: string[][] = [["draft"], ["idea"], ["draft", "wip"], ["v1"]];

function pickRandom<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomBase(): Obj {
  return {
    title: pickRandom(TITLE_POOL),
    body: pickRandom(BODY_SUFFIX_POOL),
    tags: [...pickRandom(TAGS_POOL)]
  };
}

export default function VersioningDemoPage(): React.JSX.Element {
  const [base, setBase] = useState<Obj>(DEFAULT_BASE);
  const [activeTab, setActiveTab] = useState<User>("user1");
  const [drafts, setDrafts] = useState<Record<User, Obj>>({
    user1: DEFAULT_BASE,
    user2: DEFAULT_BASE
  });

  const onDraftChange = useCallback(
    (u: User, next: Obj) => setDrafts((prev) => ({ ...prev, [u]: next })),
    []
  );

  type CommittedPatch = VersionedPatch & {
    basedOn: Obj;
    appliedState: Obj;
  };

  const [patches, setPatches] = useState<CommittedPatch[]>([]);
  const [applied, setApplied] = useState<Obj>(base);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [openConflict, setOpenConflict] = useState<OpenConflict | null>(null);

  const onCommit = useCallback(
    async (author: User) => {
      const appliedState = drafts[author];
      const delta: Delta = diff(base, appliedState);
      const vp = await makeCommit(delta, {
        author: USER_LABELS[author],
        timestamp: Date.now()
      });
      setPatches((prev) => [{ ...vp, basedOn: base, appliedState } as CommittedPatch, ...prev]);
    },
    [base, drafts]
  );

  const onApply = useCallback(
    (p: CommittedPatch) => {
      const result: MergeResult<Obj> = merge3(p.basedOn, applied, p.appliedState);
      if (result.clean) {
        setApplied(result.merged);
        setAppliedIds((prev) => {
          const next = new Set(prev);
          next.add(p.id!);
          return next;
        });
        return;
      }
      setOpenConflict({ patchId: p.id!, result, choices: new Map() });
    },
    [applied]
  );

  const onResolutionsApplied = useCallback(
    (choices: Map<Path, Resolution>) => {
      if (!openConflict) return;
      const finalResult = resolve(openConflict.result, choices);
      if (!finalResult.clean) return; // guardrail — dialog should have prevented this
      setApplied(finalResult.merged);
      setAppliedIds((prev) => {
        const next = new Set(prev);
        next.add(openConflict.patchId);
        return next;
      });
      setOpenConflict(null);
    },
    [openConflict]
  );

  const onReset = useCallback(() => {
    setApplied(base);
    setAppliedIds(new Set());
  }, [base]);

  const onReseed = useCallback(() => {
    const next = randomBase();
    setBase(next);
    setDrafts({ user1: next, user2: next });
    setApplied(next);
    setAppliedIds(new Set());
    setPatches([]);
  }, []);

  return (
    <Layout
      title="@webda/versioning demo"
      description="Interactive two-user patch/merge demo for @webda/versioning"
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>@webda/versioning demo</h1>
          <div className={styles.headerActions}>
            <button className={styles.btn} onClick={onReset} disabled={appliedIds.size === 0}>
              Reset
            </button>
            <button className={styles.btn} onClick={onReseed}>
              Re-seed base
            </button>
          </div>
        </header>

        <div className={styles.layout}>
          <section className={styles.panel}>
            <h2>Edit</h2>
            <EditorTabs
              active={activeTab}
              onChange={setActiveTab}
              drafts={drafts}
              onDraftChange={onDraftChange}
            />
            <div className={styles.commitRow}>
              <button
                className={styles.btn}
                onClick={() => void onCommit(activeTab)}
              >
                Commit {USER_LABELS[activeTab]}'s edits
              </button>
            </div>
          </section>

          <section className={styles.panel}>
            <h2>Patches</h2>
            {patches.length === 0 ? (
              <p className={styles.empty}>Nothing committed yet.</p>
            ) : (
              <div className={styles.patchList}>
                {patches.map((p) => (
                  <article key={p.id} className={styles.patchCard}>
                    <header className={styles.patchHeader}>
                      <span>
                        <span className={styles.patchAuthor}>{p.author}</span>
                        <span className={styles.patchId}>{p.id!.slice(0, 7)}</span>
                        {appliedIds.has(p.id!) ? (
                          <span className={styles.applied}> · applied</span>
                        ) : null}
                      </span>
                      <time>{new Date(p.timestamp).toLocaleTimeString()}</time>
                    </header>
                    <div className={styles.patchBody}>
                      <DiffView
                        text={renderPatch(p.basedOn, p.delta, {
                          fromLabel: "base",
                          toLabel: p.author ?? "patch",
                          sortKeys: true
                        })}
                      />
                      <div className={styles.patchActions}>
                        <button
                          className={styles.btn}
                          onClick={() => onApply(p)}
                          disabled={appliedIds.has(p.id!)}
                        >
                          Apply ▶
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <AppliedPanel base={base} applied={applied} />
          </section>
        </div>
      </div>
      {openConflict && (
        <ConflictDialog
          open={openConflict}
          onCancel={() => setOpenConflict(null)}
          onApplyResolutions={onResolutionsApplied}
        />
      )}
    </Layout>
  );
}
