import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { users } from "../api.js";

const html = htm.bind(h);

function UserForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    username: "", email: "", name: "", bio: "", website: "", password: ""
  });
  const set = (k, v) => setForm({ ...form, [k]: v });

  return html`
    <div class="modal-overlay" onClick=${(e) => e.target === e.currentTarget && onCancel()}>
      <div class="modal">
        <h2>${initial ? "Edit User" : "New User"}</h2>
        <div class="form-group">
          <label>Username</label>
          <input value=${form.username} onInput=${(e) => set("username", e.target.value)} placeholder="3-30 chars, alphanumeric + _" />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" value=${form.email} onInput=${(e) => set("email", e.target.value)} placeholder="user@example.com" />
        </div>
        <div class="form-group">
          <label>Name</label>
          <input value=${form.name} onInput=${(e) => set("name", e.target.value)} placeholder="Display name (2-50 chars)" />
        </div>
        ${!initial && html`
          <div class="form-group">
            <label>Password</label>
            <input type="password" value=${form.password || ""} onInput=${(e) => set("password", e.target.value)} placeholder="Password" />
          </div>
        `}
        <div class="form-group">
          <label>Bio</label>
          <textarea rows="3" value=${form.bio || ""} onInput=${(e) => set("bio", e.target.value)} placeholder="Short bio (max 500 chars)" />
        </div>
        <div class="form-group">
          <label>Website</label>
          <input value=${form.website || ""} onInput=${(e) => set("website", e.target.value)} placeholder="https://example.com" />
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

export function UsersPanel({ notify }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await users.list(filter);
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
        await users.create(form);
        notify("User created");
      } else {
        await users.patch(editing.uuid, form);
        notify("User updated");
      }
      setEditing(null);
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const handleDelete = async (uuid) => {
    if (!confirm("Delete this user?")) return;
    try {
      await users.delete(uuid);
      notify("User deleted");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return html`
    <div>
      <div class="toolbar">
        <input placeholder="Search users..." value=${filter} onInput=${(e) => setFilter(e.target.value)} />
        <button class="btn btn-primary" onClick=${() => setEditing("new")}>+ New User</button>
        <button class="btn btn-ghost" onClick=${load}>Refresh</button>
      </div>
      ${items.length === 0 ? html`
        <div class="empty">${loading ? "Loading..." : "No users yet. Create one!"}</div>
      ` : html`
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(u => html`
              <tr key=${u.uuid}>
                <td class="mono">${u.username}</td>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setEditing(u)}>Edit</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px" onClick=${() => handleDelete(u.uuid)}>Delete</button>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
      ${editing !== null && html`
        <${UserForm}
          initial=${editing === "new" ? null : editing}
          onSave=${handleSave}
          onCancel=${() => setEditing(null)}
        />
      `}
    </div>
  `;
}
