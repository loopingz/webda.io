import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { tags } from "../api.js";

const html = htm.bind(h);

/** Editable tag fields. Relations (`posts`, ...) are omitted so PATCH
 *  bodies satisfy the server's `additionalProperties: false` schema. */
const TAG_EDITABLE_FIELDS = ["name", "slug", "description", "color"];
const TAG_DEFAULTS = { name: "", slug: "", description: "", color: "#4f8ff7" };

function pickTagFormFields(source) {
  if (!source) return { ...TAG_DEFAULTS };
  const out = { ...TAG_DEFAULTS };
  for (const k of TAG_EDITABLE_FIELDS) {
    if (source[k] !== undefined) out[k] = source[k];
  }
  return out;
}

function TagForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(pickTagFormFields(initial));
  const set = (k, v) => setForm({ ...form, [k]: v });

  return html`
    <div class="modal-overlay" onClick=${(e) => e.target === e.currentTarget && onCancel()}>
      <div class="modal">
        <h2>${initial ? "Edit Tag" : "New Tag"}</h2>
        <div class="form-group">
          <label>Name</label>
          <input value=${form.name} onInput=${(e) => set("name", e.target.value)} placeholder="Tag name (2-30 chars)" />
        </div>
        <div class="form-group">
          <label>Slug</label>
          <input value=${form.slug} onInput=${(e) => set("slug", e.target.value)} placeholder="tag-slug" disabled=${!!initial} />
        </div>
        <div class="form-group">
          <label>Description</label>
          <input value=${form.description || ""} onInput=${(e) => set("description", e.target.value)} placeholder="Short description (max 200 chars)" />
        </div>
        <div class="form-group">
          <label>Color</label>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <input type="color" value=${form.color || "#4f8ff7"} onInput=${(e) => set("color", e.target.value)} style="width:40px;height:32px;padding:2px;cursor:pointer" />
            <input value=${form.color || ""} onInput=${(e) => set("color", e.target.value)} placeholder="#4f8ff7" style="flex:1" />
          </div>
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

export function TagsPanel({ notify }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await tags.list(filter);
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
        await tags.create(form);
        notify("Tag created");
      } else {
        await tags.patch(editing.slug, form);
        notify("Tag updated");
      }
      setEditing(null);
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const handleDelete = async (slug) => {
    if (!confirm(`Delete tag "${slug}"?`)) return;
    try {
      await tags.delete(slug);
      notify("Tag deleted");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return html`
    <div>
      <div class="toolbar">
        <input placeholder="Search tags..." value=${filter} onInput=${(e) => setFilter(e.target.value)} />
        <button class="btn btn-primary" onClick=${() => setEditing("new")}>+ New Tag</button>
        <button class="btn btn-ghost" onClick=${load}>Refresh</button>
      </div>
      ${items.length === 0 ? html`
        <div class="empty">${loading ? "Loading..." : "No tags yet. Create one!"}</div>
      ` : html`
        <table>
          <thead>
            <tr>
              <th>Color</th>
              <th>Name</th>
              <th>Slug</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(t => html`
              <tr key=${t.slug}>
                <td><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${t.color || '#666'}" /></td>
                <td>${t.name}</td>
                <td class="mono">${t.slug}</td>
                <td style="color:var(--text-muted)">${t.description || "-"}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setEditing(t)}>Edit</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px" onClick=${() => handleDelete(t.slug)}>Delete</button>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
      ${editing !== null && html`
        <${TagForm}
          initial=${editing === "new" ? null : editing}
          onSave=${handleSave}
          onCancel=${() => setEditing(null)}
        />
      `}
    </div>
  `;
}
