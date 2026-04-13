import { h, render } from "https://esm.sh/preact@10.25.4";
import { useState, useCallback } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { PostsPanel } from "./components/posts.js";
import { UsersPanel } from "./components/users.js";
import { TagsPanel } from "./components/tags.js";
import { CommentsPanel } from "./components/comments.js";

const html = htm.bind(h);

const TABS = [
  { id: "posts", label: "Posts" },
  { id: "users", label: "Users" },
  { id: "tags", label: "Tags" },
  { id: "comments", label: "Comments" },
];

function Toast({ message, type, onDone }) {
  if (!message) return null;
  setTimeout(onDone, 3000);
  return html`<div class="toast toast-${type}">${message}</div>`;
}

function App() {
  const [tab, setTab] = useState("posts");
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  return html`
    <div class="app">
      <div class="header">
        <h1><span>Blog</span> Admin</h1>
        <div class="nav">
          ${TABS.map(t => html`
            <button
              key=${t.id}
              class=${tab === t.id ? "active" : ""}
              onClick=${() => setTab(t.id)}
            >${t.label}</button>
          `)}
        </div>
      </div>
      <div class="content">
        ${tab === "posts" && html`<${PostsPanel} notify=${notify} />`}
        ${tab === "users" && html`<${UsersPanel} notify=${notify} />`}
        ${tab === "tags" && html`<${TagsPanel} notify=${notify} />`}
        ${tab === "comments" && html`<${CommentsPanel} notify=${notify} />`}
      </div>
      ${toast && html`<${Toast} message=${toast.message} type=${toast.type} onDone=${clearToast} />`}
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
