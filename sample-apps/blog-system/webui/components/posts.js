import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { posts } from "../api.js";

const html = htm.bind(h);

function PostForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    title: "", slug: "", content: "", excerpt: "", status: "draft", viewCount: 0
  });
  const set = (k, v) => setForm({ ...form, [k]: v });

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
        <div class="modal-actions">
          <button class="btn btn-ghost" onClick=${onCancel}>Cancel</button>
          <button class="btn btn-primary" onClick=${() => onSave(form)}>
            ${initial ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
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
        await posts.create(form);
        notify("Post created");
      } else {
        await posts.patch(editing.slug, form);
        notify("Post updated");
      }
      setEditing(null);
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
        />
      `}
    </div>
  `;
}
