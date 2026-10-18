import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect, useRef } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { posts, binaries, ql } from "../api.js";
import { useDebounced } from "../hooks.js";
import { HistoryButton } from "./audit.js";

const html = htm.bind(h);

function formatBytes(n) {
  if (typeof n !== "number" || !isFinite(n)) return "?";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * True when the binary looks like an inline-renderable image — checks both
 * the declared mimetype and the filename extension so uploads with a
 * generic `application/octet-stream` mimetype but a recognisable name
 * still render as `<img>`.
 */
function isImage(value) {
  if (!value) return false;
  if ((value.mimetype || "").startsWith("image/")) return true;
  const name = (value.name || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg)$/.test(name);
}

/**
 * Banner explaining the challenge flow. Rendered above the upload UI as
 * a one-paragraph intro for first-time users of the demo.
 */
function ChallengeBanner() {
  return html`
    <div class="banner">
      <strong>Challenge upload demo.</strong>
      The client computes <code>MD5(bytes)</code> and <code>MD5("WEBDA" + bytes)</code>,
      then PUTs them as JSON. If the server already has those bytes linked
      to this attribute it replies <code>{done:true}</code> and the upload
      is skipped — instant link. Otherwise the server hands back a signed
      URL the client PUTs the bytes to (or the UI falls back to a direct
      multipart POST when no signed URL is available).
    </div>
  `;
}

/**
 * UI for a single Binary attribute (Post.mainImage).
 *
 * The `value` prop is whatever the server serialised for this attribute:
 * either a falsy/empty marker when nothing is attached, or an object with
 * at least { hash, name?, size?, mimetype?, metadata? }.
 */
function BinaryBlock({ slug, attribute, label, value, onChange, notify }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const isAttached = !!(value && value.hash);

  const reset = () => { if (fileRef.current) fileRef.current.value = ""; };

  const wrap = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };

  const doDirect = () => wrap(async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return notify("Pick a file first", "error");
    await binaries.uploadDirect(slug, attribute, f);
    notify(`Uploaded ${f.name} (direct)`);
    reset(); await onChange();
  });

  const doChallenge = () => wrap(async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return notify("Pick a file first", "error");
    const r = await binaries.uploadChallenge(slug, attribute, f);
    if (r.done) {
      notify(`${f.name}: already known to platform — instant link`);
    } else if (r.viaSignedUrl) {
      notify(`${f.name}: uploaded via signed URL`);
    } else if (r.fallback) {
      notify(`${f.name}: challenge unsupported, fell back to direct POST`);
    } else {
      notify(`${f.name}: uploaded (direct fallback)`);
    }
    reset(); await onChange();
  });

  const doDelete = () => wrap(async () => {
    if (!confirm(`Delete ${attribute}?`)) return;
    await binaries.delete(slug, attribute, value.hash);
    notify(`${attribute} deleted`);
    await onChange();
  });

  const doMeta = () => wrap(async () => {
    const w = parseInt(prompt("Width (px)?", value?.metadata?.width ?? "") || "");
    const h = parseInt(prompt("Height (px)?", value?.metadata?.height ?? "") || "");
    if (isNaN(w) || isNaN(h)) return notify("Width/height must be numbers", "error");
    await binaries.setMetadata(slug, attribute, value.hash, { width: w, height: h });
    notify(`Metadata updated (${w}×${h})`);
    await onChange();
  });

  return html`
    <div class="binary-block">
      <div class="binary-header">
        <span class="binary-label">${label}</span>
        ${isAttached
          ? html`<span class="badge badge-blue">attached</span>`
          : html`<span class="badge badge-yellow">empty</span>`}
      </div>
      ${isAttached ? html`
        <div class="binary-preview">
          ${isImage(value) && html`
            <img src=${binaries.streamUrl(slug, attribute) + `?t=${value.hash}`} alt=${value.name || ""} />
          `}
          <div class="binary-info">
            <div><strong>${value.name || "(no name)"}</strong></div>
            <div class="muted">${value.mimetype || "?"} · ${formatBytes(value.size)}</div>
            <div class="muted mono">${value.hash}</div>
            ${(value.metadata && (value.metadata.width || value.metadata.height)) && html`
              <div class="muted">${value.metadata.width || "?"} × ${value.metadata.height || "?"}</div>
            `}
          </div>
        </div>
      ` : html`
        <div class="binary-empty">No file attached.</div>
      `}
      <div class="binary-controls">
        <input type="file" ref=${fileRef} disabled=${busy} />
        <div class="binary-actions">
          <button class="btn btn-primary btn-sm" disabled=${busy} onClick=${doDirect}>
            ${isAttached ? "Replace (direct)" : "Upload (direct)"}
          </button>
          <button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${doChallenge}>
            ${isAttached ? "Replace (challenge)" : "Upload (challenge)"}
          </button>
          ${isAttached && html`
            <button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${doMeta}>Set width/height</button>
            <button class="btn btn-danger btn-sm" disabled=${busy} onClick=${doDelete}>Delete</button>
          `}
        </div>
      </div>
    </div>
  `;
}

/**
 * UI for a Binaries collection attribute (Post.images).
 */
function BinariesBlock({ slug, attribute, label, items, onChange, notify }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const list = Array.isArray(items) ? items : [];

  const reset = () => { if (fileRef.current) fileRef.current.value = ""; };
  const wrap = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };

  const doDirect = () => wrap(async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return notify("Pick a file first", "error");
    await binaries.uploadDirect(slug, attribute, f);
    notify(`Pushed ${f.name} (direct)`);
    reset(); await onChange();
  });

  const doChallenge = () => wrap(async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return notify("Pick a file first", "error");
    const r = await binaries.uploadChallenge(slug, attribute, f);
    if (r.done) {
      notify(`${f.name}: already known to platform — instant link`);
    } else if (r.viaSignedUrl) {
      notify(`${f.name}: pushed via signed URL`);
    } else if (r.fallback) {
      notify(`${f.name}: challenge unsupported, fell back to direct POST`);
    } else {
      notify(`${f.name}: pushed (direct fallback)`);
    }
    reset(); await onChange();
  });

  const doItemDelete = (idx, hash) => wrap(async () => {
    if (!confirm(`Delete item #${idx}?`)) return;
    await binaries.deleteItem(slug, attribute, idx, hash);
    notify(`Item #${idx} deleted`);
    await onChange();
  });

  const doItemMeta = (idx, hash, current) => wrap(async () => {
    const w = parseInt(prompt("Width (px)?", current?.width ?? "") || "");
    const h = parseInt(prompt("Height (px)?", current?.height ?? "") || "");
    if (isNaN(w) || isNaN(h)) return notify("Width/height must be numbers", "error");
    await binaries.setItemMetadata(slug, attribute, idx, hash, { width: w, height: h });
    notify(`Metadata updated for #${idx}`);
    await onChange();
  });

  return html`
    <div class="binary-block">
      <div class="binary-header">
        <span class="binary-label">${label}</span>
        <span class="badge badge-blue">${list.length} item${list.length === 1 ? "" : "s"}</span>
      </div>
      ${list.length === 0 ? html`
        <div class="binary-empty">No items yet.</div>
      ` : html`
        <table class="binaries-list">
          <thead>
            <tr><th></th><th>#</th><th>Name</th><th>Type</th><th>Size</th><th>W×H</th><th>Hash</th><th></th></tr>
          </thead>
          <tbody>
            ${list.map((it, idx) => html`
              <tr key=${idx}>
                <td class="binaries-thumb">
                  ${isImage(it) && html`
                    <img src=${binaries.streamUrl(slug, attribute, idx) + `?t=${it.hash}`} alt=${it.name || ""} />
                  `}
                </td>
                <td>${idx}</td>
                <td>${it.name || "(no name)"}</td>
                <td class="muted">${it.mimetype || "?"}</td>
                <td>${formatBytes(it.size)}</td>
                <td class="muted">${(it.metadata && (it.metadata.width || it.metadata.height)) ? `${it.metadata.width || "?"}×${it.metadata.height || "?"}` : "—"}</td>
                <td class="muted mono small">${(it.hash || "").slice(0, 10)}…</td>
                <td>
                  <button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${() => doItemMeta(idx, it.hash, it.metadata)}>Meta</button>
                  <button class="btn btn-danger btn-sm" disabled=${busy} onClick=${() => doItemDelete(idx, it.hash)}>Delete</button>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
      <div class="binary-controls">
        <input type="file" ref=${fileRef} disabled=${busy} />
        <div class="binary-actions">
          <button class="btn btn-primary btn-sm" disabled=${busy} onClick=${doDirect}>Add (direct)</button>
          <button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${doChallenge}>Add (challenge)</button>
        </div>
      </div>
    </div>
  `;
}

/** Editable post fields. Relations (`mainImage`, `images`, ...) and
 *  read-only bookkeeping are omitted so PATCH bodies don't trip the
 *  server's `additionalProperties: false` schema. */
const POST_EDITABLE_FIELDS = ["title", "slug", "content", "excerpt", "status", "viewCount"];
const POST_DEFAULTS = { title: "", slug: "", content: "", excerpt: "", status: "draft", viewCount: 0 };

function pickPostFormFields(source) {
  if (!source) return { ...POST_DEFAULTS };
  const out = { ...POST_DEFAULTS };
  for (const k of POST_EDITABLE_FIELDS) {
    if (source[k] !== undefined) out[k] = source[k];
  }
  return out;
}

function PostForm({ initial, onSave, onCancel, notify }) {
  const [form, setForm] = useState(pickPostFormFields(initial));
  const [post, setPost] = useState(initial); // refreshed copy for binary state
  const set = (k, v) => setForm({ ...form, [k]: v });
  const slug = post?.slug;

  const refresh = async () => {
    if (!slug) return;
    try {
      const fresh = await posts.get(slug);
      setPost(fresh);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return html`
    <div class="modal-overlay" onClick=${(e) => e.target === e.currentTarget && onCancel()}>
      <div class="modal">
        <h2>${initial ? "Edit Post" : "New Post"}</h2>
        <div class="form-group">
          <label>Title</label>
          <input value=${form.title} onInput=${(e) => set("title", e.target.value)} placeholder="Post title (5-200 chars)" />
        </div>
        <div class="form-group">
          <label>Slug</label>
          <input value=${form.slug} onInput=${(e) => set("slug", e.target.value)} placeholder="url-friendly-slug" disabled=${!!initial} />
        </div>
        <div class="form-group">
          <label>Content</label>
          <textarea rows="6" value=${form.content} onInput=${(e) => set("content", e.target.value)} placeholder="Markdown content (min 10 chars)" />
        </div>
        <div class="form-group">
          <label>Excerpt</label>
          <input value=${form.excerpt || ""} onInput=${(e) => set("excerpt", e.target.value)} placeholder="Short excerpt (max 500 chars)" />
        </div>
        <div class="form-group">
          <label>Status</label>
          <select value=${form.status} onChange=${(e) => set("status", e.target.value)}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        ${slug ? html`
          <${ChallengeBanner} />
          <${BinaryBlock}
            slug=${slug}
            attribute="mainImage"
            label="Main image"
            value=${post?.mainImage}
            onChange=${refresh}
            notify=${notify}
          />
          <${BinariesBlock}
            slug=${slug}
            attribute="images"
            label="Additional images"
            items=${post?.images}
            onChange=${refresh}
            notify=${notify}
          />
        ` : html`
          <div class="binary-empty">Save the post first to attach images.</div>
        `}

        <div class="modal-actions">
          <button class="btn btn-ghost" onClick=${onCancel}>Close</button>
          <button class="btn btn-primary" onClick=${() => onSave(form)}>
            ${initial ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function mediaIndicator(p) {
  const main = !!(p.mainImage && p.mainImage.hash);
  const extra = Array.isArray(p.images) ? p.images.length : 0;
  if (!main && extra === 0) return html`<span class="muted">—</span>`;
  return html`
    <span title=${`mainImage: ${main ? "yes" : "no"} · images: ${extra}`}>
      ${main ? html`<span class="dot dot-on" />` : html`<span class="dot dot-off" />`}
      <span class="muted small">+${extra}</span>
    </span>
  `;
}

/**
 * WebdaQL Search Input with live code completion powered by @webda/ql
 */
function QLSearchField({ value, onChange, onSearch, model = "WebdaSample/Post" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const fetchCompletions = async (text, caret) => {
    try {
      const res = await ql.complete(text, caret, model);
      if (res?.items?.length) {
        setSuggestions(res.items);
        setShowDropdown(true);
        setActiveIndex(0);
      } else {
        setSuggestions([]);
        setShowDropdown(false);
      }
    } catch {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const applySuggestion = (item) => {
    if (!item) return;
    const input = inputRef.current;
    const current = value || "";
    const [start, end] = item.range;
    const nextVal = current.slice(0, start) + item.insertText + current.slice(end);
    onChange(nextVal);
    const nextCaret = start + item.insertText.length;
    setShowDropdown(false);
    setSuggestions([]);
    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(nextCaret, nextCaret);
        fetchCompletions(nextVal, nextCaret);
      }
    }, 10);
  };

  const handleInput = (e) => {
    const val = e.target.value;
    const caret = e.target.selectionStart ?? val.length;
    onChange(val);
    fetchCompletions(val, caret);
  };

  const handleKeyDown = (e) => {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applySuggestion(suggestions[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }
    if (e.key === "Enter") {
      onSearch();
    }
  };

  const handleFocus = (e) => {
    const caret = e.target.selectionStart ?? (value || "").length;
    fetchCompletions(value || "", caret);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };

  return html`
    <div class="ql-search-wrapper">
      <input
        ref=${inputRef}
        class="ql-search-input"
        placeholder="WebdaQL query (e.g. status = 'published' AND viewCount > 10)..."
        value=${value}
        onInput=${handleInput}
        onKeyDown=${handleKeyDown}
        onFocus=${handleFocus}
        onBlur=${handleBlur}
      />
      ${showDropdown && suggestions.length > 0 && html`
        <div class="ql-dropdown">
          ${suggestions.map((item, idx) => html`
            <div
              key=${item.label + idx}
              class="ql-suggestion-item ${idx === activeIndex ? "active" : ""}"
              onMouseDown=${(e) => {
                e.preventDefault();
                applySuggestion(item);
              }}
            >
              <span class="ql-suggestion-label">${item.label}</span>
              ${item.detail && html`<span class="ql-suggestion-detail">${item.detail}</span>`}
              <span class="ql-kind-badge ql-kind-${item.kind}">${item.kind}</span>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

const QUICK_QUERIES = [
  { label: "Published posts", query: "status = 'published'" },
  { label: "Drafts", query: "status = 'draft'" },
  { label: "Popular posts", query: "viewCount > 0 ORDER BY viewCount DESC" },
  { label: "Archived", query: "status = 'archived'" },
];

export function PostsPanel({ notify }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [qlQuery, setQlQuery] = useState("");
  const [mode, setMode] = useState("ql"); // "ql" | "text"
  const debouncedSearch = useDebounced(search);
  const debouncedQl = useDebounced(qlQuery);
  const [editing, setEditing] = useState(null); // null | "new" | post object
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const q = mode === "ql" ? qlQuery : "";
      const textFilter = mode === "text" ? debouncedSearch : "";
      const res = await posts.list(textFilter, q);
      setItems(res?.results || []);
    } catch (e) {
      notify(e.message, "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [debouncedSearch, debouncedQl, mode]);

  const handleSave = async (form) => {
    try {
      if (editing === "new") {
        const created = await posts.create(form);
        notify("Post created");
        // Reopen the form on the saved object so binaries can be uploaded.
        setEditing(created || form);
      } else {
        await posts.patch(editing.slug, form);
        notify("Post updated");
        setEditing(null);
      }
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const handleDelete = async (slug) => {
    if (!confirm(`Delete post "${slug}"?`)) return;
    try {
      await posts.delete(slug);
      notify("Post deleted");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return html`
    <div>
      <div class="toolbar">
        ${mode === "ql" ? html`
          <${QLSearchField}
            value=${qlQuery}
            onChange=${setQlQuery}
            onSearch=${load}
            model="WebdaSample/Post"
          />
        ` : html`
          <input
            placeholder="Search posts..."
            value=${search}
            onInput=${(e) => setSearch(e.target.value)}
          />
        `}
        <button
          class="btn btn-ghost btn-sm"
          onClick=${() => {
            if (mode === "ql") {
              setMode("text");
              setQlQuery("");
            } else {
              setMode("ql");
              setSearch("");
            }
          }}
          title="Toggle search mode"
        >
          ${mode === "ql" ? "Switch to Text Search" : "Switch to WebdaQL"}
        </button>
        ${(qlQuery || search) && html`
          <button
            class="btn btn-ghost btn-sm"
            onClick=${() => {
              setQlQuery("");
              setSearch("");
            }}
          >
            Clear
          </button>
        `}
        <button class="btn btn-primary" onClick=${() => setEditing("new")}>+ New Post</button>
        <button class="btn btn-ghost" onClick=${load}>Refresh</button>
      </div>

      ${mode === "ql" && html`
        <div class="ql-quick-pills">
          <span>Quick queries:</span>
          ${QUICK_QUERIES.map(
            (p) => html`
              <button
                key=${p.label}
                class="ql-pill"
                onClick=${() => {
                  setQlQuery(p.query);
                }}
              >
                ${p.label}
              </button>
            `
          )}
        </div>
      `}

      ${items.length === 0 ? html`
        <div class="empty">${loading ? "Loading..." : "No posts yet. Create one or adjust your filter!"}</div>
      ` : html`
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Media</th>
              <th>Views</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(
              (p) => html`
                <tr key=${p.slug}>
                  <td>${p.title}</td>
                  <td class="mono">${p.slug}</td>
                  <td>
                    <span
                      class="badge ${p.status === "published"
                        ? "badge-green"
                        : p.status === "draft"
                          ? "badge-yellow"
                          : "badge-red"}"
                    >
                      ${p.status}
                    </span>
                  </td>
                  <td>${mediaIndicator(p)}</td>
                  <td>${p.viewCount || 0}</td>
                  <td>
                    <button class="btn btn-ghost btn-sm" onClick=${() => setEditing(p)}>Edit</button>
                    <${HistoryButton} model="WebdaSample/Post" objectKey=${p.slug} notify=${notify} />
                    <button
                      class="btn btn-danger btn-sm"
                      style="margin-left:4px"
                      onClick=${() => handleDelete(p.slug)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
      `}
      ${editing !== null && html`
        <${PostForm}
          initial=${editing === "new" ? null : editing}
          onSave=${handleSave}
          onCancel=${() => setEditing(null)}
          notify=${notify}
        />
      `}
    </div>
  `;
}
