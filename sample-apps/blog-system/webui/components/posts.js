import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect, useRef } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { posts, binaries } from "../api.js";

const html = htm.bind(h);

function formatBytes(n) {
  if (typeof n !== "number" || !isFinite(n)) return "?";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
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
          ${(value.mimetype || "").startsWith("image/") && html`
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
            <tr><th>#</th><th>Name</th><th>Type</th><th>Size</th><th>W×H</th><th>Hash</th><th></th></tr>
          </thead>
          <tbody>
            ${list.map((it, idx) => html`
              <tr key=${idx}>
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

function PostForm({ initial, onSave, onCancel, notify }) {
  const [form, setForm] = useState(initial || {
    title: "", slug: "", content: "", excerpt: "", status: "draft", viewCount: 0
  });
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
          <input value=${form.slug} onInput=${(e) => set("slug", e.target.value)} placeholder="url-friendly-slug" ${initial ? "disabled" : ""} />
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

export function PostsPanel({ notify }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | post object
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await posts.list(filter);
      setItems(res?.results || []);
    } catch (e) {
      notify(e.message, "error");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

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
        <input placeholder="Search posts..." value=${filter} onInput=${(e) => setFilter(e.target.value)} />
        <button class="btn btn-primary" onClick=${() => setEditing("new")}>+ New Post</button>
        <button class="btn btn-ghost" onClick=${load}>Refresh</button>
      </div>
      ${items.length === 0 ? html`
        <div class="empty">${loading ? "Loading..." : "No posts yet. Create one!"}</div>
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
            ${items.map(p => html`
              <tr key=${p.slug}>
                <td>${p.title}</td>
                <td class="mono">${p.slug}</td>
                <td>
                  <span class="badge ${p.status === "published" ? "badge-green" : p.status === "draft" ? "badge-yellow" : "badge-red"}">
                    ${p.status}
                  </span>
                </td>
                <td>${mediaIndicator(p)}</td>
                <td>${p.viewCount || 0}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setEditing(p)}>Edit</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px" onClick=${() => handleDelete(p.slug)}>Delete</button>
                </td>
              </tr>
            `)}
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
