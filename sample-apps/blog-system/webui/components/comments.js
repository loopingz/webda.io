import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { comments } from "../api.js";

const html = htm.bind(h);

/** Comments only edit `content`; relations / bookkeeping are stripped so
 *  PATCH bodies pass the server's `additionalProperties: false` schema. */
function pickCommentFormFields(source) {
  return { content: source?.content ?? "" };
}

function CommentForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(pickCommentFormFields(initial));
  const set = (k, v) => setForm({ ...form, [k]: v });

  return html`
    <div class="modal-overlay" onClick=${(e) => e.target === e.currentTarget && onCancel()}>
      <div class="modal">
        <h2>${initial ? "Edit Comment" : "New Comment"}</h2>
        <div class="form-group">
          <label>Content</label>
          <textarea rows="4" value=${form.content} onInput=${(e) => set("content", e.target.value)} placeholder="Comment text (1-2000 chars)" />
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

function formatDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

export function CommentsPanel({ notify }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await comments.list(filter);
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
        await comments.create(form);
        notify("Comment created");
      } else {
        await comments.patch(editing.uuid, form);
        notify("Comment updated");
      }
      setEditing(null);
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const handleDelete = async (uuid) => {
    if (!confirm("Delete this comment?")) return;
    try {
      await comments.delete(uuid);
      notify("Comment deleted");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return html`
    <div>
      <div class="toolbar">
        <input placeholder="Search comments..." value=${filter} onInput=${(e) => setFilter(e.target.value)} />
        <button class="btn btn-primary" onClick=${() => setEditing("new")}>+ New Comment</button>
        <button class="btn btn-ghost" onClick=${load}>Refresh</button>
      </div>
      ${items.length === 0 ? html`
        <div class="empty">${loading ? "Loading..." : "No comments yet."}</div>
      ` : html`
        <table>
          <thead>
            <tr>
              <th style="width:80px">ID</th>
              <th>Content</th>
              <th>Edited</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(c => html`
              <tr key=${c.uuid}>
                <td class="mono" style="font-size:0.75rem;color:var(--text-muted)">${(c.uuid || "").substring(0, 8)}...</td>
                <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.content}</td>
                <td>${c.isEdited ? html`<span class="badge badge-yellow">edited</span>` : "-"}</td>
                <td style="color:var(--text-muted);font-size:0.8125rem">${formatDate(c.createdAt)}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setEditing(c)}>Edit</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px" onClick=${() => handleDelete(c.uuid)}>Delete</button>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
      ${editing !== null && html`
        <${CommentForm}
          initial=${editing === "new" ? null : editing}
          onSave=${handleSave}
          onCancel=${() => setEditing(null)}
        />
      `}
    </div>
  `;
}
