import { randomBytes } from "node:crypto";

/**
 * Built-in pages of the OAuth server: static shells whose inline script calls the REST hints of the consent and
 * device operations, the same contract as an application UI. No external asset; every untrusted value is escaped
 * here or set through `textContent` by the script, never through `innerHTML`
 */

/** Maximum length of an untrusted value echoed by a page */
export const MAX_ECHO = 200;

/**
 * @param value - untrusted value
 * @returns the value, safe in HTML text and in double or single quoted attributes
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @returns a new script nonce
 */
export function newNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * @param nonce - nonce of the page script
 * @returns the headers of a page response: no caching, no framing, only the nonce-bound script
 */
export function pageHeaders(nonce: string): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: data:; ` +
      `connect-src 'self'; form-action 'none'; frame-ancestors 'none'`,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
}

/** Style of the pages */
const STYLE = `
:root { color-scheme: light dark; --fg: #1f2328; --muted: #59636e; --bg: #ffffff; --card: #f6f8fa; --line: #d1d9e0;
  --accent: #0969da; --warn-bg: #fff8c5; --warn-fg: #6a4b00; --err: #cf222e; }
@media (prefers-color-scheme: dark) { :root { --fg: #e6edf3; --muted: #9198a1; --bg: #0d1117; --card: #151b23;
  --line: #3d444d; --accent: #4493f8; --warn-bg: #3a2e00; --warn-fg: #f2cc60; --err: #ff7b72; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, sans-serif; }
main { max-width: 32rem; margin: 2rem auto; padding: 1.5rem 16px; }
header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
header img { width: 48px; height: 48px; border-radius: 8px; object-fit: contain; }
h1 { font-size: 1.35rem; margin: 0.5rem 0; overflow-wrap: anywhere; }
.muted { color: var(--muted); overflow-wrap: anywhere; }
.warning { background: var(--warn-bg); color: var(--warn-fg); padding: 0.6rem 0.8rem; border-radius: 6px;
  overflow-wrap: anywhere; }
.error { color: var(--err); overflow-wrap: anywhere; }
details { border: 1px solid var(--line); border-radius: 6px; margin: 0.5rem 0; background: var(--card); }
summary { padding: 0.5rem 0.75rem; cursor: pointer; font-weight: 600; }
label.op { display: block; padding: 0.25rem 0.75rem 0.25rem 2rem; overflow-wrap: anywhere; }
code { font-size: 0.9em; }
.actions { display: flex; gap: 0.75rem; margin-top: 1.25rem; }
button { font: inherit; padding: 0.5rem 1.25rem; border-radius: 6px; border: 1px solid var(--line);
  background: var(--card); color: var(--fg); cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button:disabled { opacity: 0.6; cursor: default; }
input[type="text"] { font: 1.4rem ui-monospace, monospace; letter-spacing: 0.15em; text-transform: uppercase;
  padding: 0.5rem; width: 100%; max-width: 14rem; border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg); color: var(--fg); }
`;

/**
 * @param title - page title
 * @param body - HTML of the body: escaped by the caller
 * @param script - inline script, static code only
 * @param nonce - nonce of the script, also sent in the Content-Security-Policy; required with a script
 * @returns the HTML document
 */
export function renderPage(title: string, body: string, script?: string, nonce?: string): string {
  if (script !== undefined && !nonce) throw new Error("A page script requires a nonce");
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>` +
    `<body>${body}${script !== undefined ? `<script nonce="${escapeHtml(nonce)}">${script}</script>` : ""}` +
    `</body></html>`
  );
}

/**
 * Helpers shared by the page scripts: element creation (text only), status line, guarded navigation and API calls
 */
const SCRIPT_HELPERS = `
  const app = document.getElementById("app");
  const api = app.dataset.api;
  const status = document.getElementById("status");
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const fail = text => {
    status.textContent = text;
    status.className = "error";
  };
  const go = target => {
    let url;
    try {
      url = new URL(target, location.href);
    } catch (err) {
      return fail("Invalid redirect");
    }
    if (["javascript:", "data:", "vbscript:", "blob:", "file:"].includes(url.protocol)) return fail("Invalid redirect");
    location.assign(url.href);
  };
  const call = async (method, path, body) => {
    const res = await fetch(api + path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const err = new Error("HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };
`;

/** Consent page script: fetch the pending request, render it, send the decision */
const CONSENT_SCRIPT = `"use strict";
(() => {${SCRIPT_HELPERS}
  const https = value => typeof value === "string" && /^https:\\/\\//.test(value);
  const failure = err => {
    if (err.status === 401) return "You are not signed in: start again from the app.";
    if (err.status === 400 || err.status === 403 || err.status === 404) {
      return "This sign-in request expired or was already used: start again from the app.";
    }
    return "Something went wrong (" + (err.status || "network error") + "): try again.";
  };
  const render = req => {
    app.replaceChildren();
    status.textContent = "";
    status.className = "muted";
    const head = el("header");
    if (https(req.client.logo)) {
      const logo = el("img");
      logo.alt = "";
      logo.src = req.client.logo;
      head.append(logo);
    }
    const unverified = req.client.verified === false;
    head.append(el("h1", unverified ? "\u201c" + (req.client.name || req.client.id) + "\u201d" : req.client.name || req.client.id));
    app.append(head);
    if (unverified) {
      app.append(el("p", "Unverified application: its name was chosen by whoever registered it.", "warning"));
      if (req.client.host) app.append(el("p", "Redirects to " + req.client.host, "muted"));
    } else if (req.client.host) {
      app.append(el("p", "Application published by " + req.client.host, "muted"));
    }
    if (https(req.client.uri)) {
      const link = el("a", req.client.uri);
      link.href = req.client.uri;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      const line = el("p", undefined, "muted");
      line.append(link);
      app.append(line);
    }
    app.append(el("p", "Signed in as " + (req.user.name || req.user.id), "muted"));
    if (req.flow === "device") {
      app.append(
        el("p", "Only continue if you started this sign-in yourself on " + (req.hostname || "another device") + ".", "warning")
      );
    }
    const boxes = [];
    if (req.operations.length) {
      app.append(el("p", "This application requests access to:"));
      for (const group of req.operations) {
        const details = el("details");
        const summary = el("summary");
        const all = el("input");
        all.type = "checkbox";
        const label = el("label");
        label.append(all, " " + group.group);
        summary.append(label);
        details.append(summary);
        const children = [];
        for (const op of group.ids) {
          const box = el("input");
          box.type = "checkbox";
          box.value = op.id;
          box.checked = op.preselected !== false || op.alreadyAllowed === true;
          // Granted by an earlier decision: shown, but not a choice of this one
          box.disabled = op.alreadyAllowed === true;
          const row = el("label", undefined, "op");
          row.append(box, " ", el("code", op.id));
          if (op.summary) row.append(" — " + op.summary);
          if (op.alreadyAllowed) row.append(" (already allowed)");
          details.append(row);
          children.push(box);
          boxes.push(box);
        }
        const sync = () => {
          const checked = children.filter(box => box.checked).length;
          all.checked = checked === children.length;
          all.indeterminate = checked > 0 && checked < children.length;
        };
        all.addEventListener("change", () => {
          for (const box of children) if (!box.disabled) box.checked = all.checked;
          sync();
        });
        for (const box of children) box.addEventListener("change", sync);
        sync();
        app.append(details);
      }
    } else {
      app.append(el("p", "Nothing to grant"));
    }
    if (req.offlineAccess) {
      app.append(el("p", "This application stays signed in (refresh token) until you revoke its access.", "muted"));
    }
    let remember;
    if (req.rememberable && req.operations.length) {
      remember = el("input");
      remember.type = "checkbox";
      const label = el("label");
      label.append(remember, " Remember for this app");
      const line = el("p");
      line.append(label);
      app.append(line);
    }
    const actions = el("div", undefined, "actions");
    const decide = async allow => {
      for (const button of actions.querySelectorAll("button")) button.disabled = true;
      status.textContent = "";
      try {
        const body = { allow, operations: allow ? boxes.filter(box => box.checked && !box.disabled).map(box => box.value) : [], csrf: req.csrf };
        if (remember) body.remember = remember.checked;
        const res = await call("POST", "/consent/decide", body);
        go(res.redirect);
      } catch (err) {
        fail(failure(err));
        for (const button of actions.querySelectorAll("button")) button.disabled = false;
      }
    };
    if (req.operations.length) {
      const allow = el("button", "Allow", "primary");
      allow.type = "button";
      allow.addEventListener("click", () => decide(true));
      actions.append(allow);
    }
    const deny = el("button", "Deny");
    deny.type = "button";
    deny.addEventListener("click", () => decide(false));
    actions.append(deny);
    app.append(actions, status);
  };
  call("GET", "/consent/request").then(render, err => fail(failure(err)));
})();
`;

/**
 * Consent page
 * @param apiBase - path of the OAuthServer routes of the browser operations (`<apiBase>/consent/request`)
 * @param nonce - nonce of the page script
 * @returns the HTML document
 */
export function consentHtml(apiBase: string, nonce: string): string {
  return renderPage(
    "Authorize access",
    `<main id="app" data-api="${escapeHtml(apiBase)}"><p id="status" class="muted">Loading…</p></main>`,
    CONSENT_SCRIPT,
    nonce
  );
}

/** Device page script: look the code up, then go to the consent page */
const DEVICE_SCRIPT = `"use strict";
(() => {${SCRIPT_HELPERS}
  const form = document.getElementById("device");
  const input = document.getElementById("code");
  const button = document.getElementById("submit");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = "";
    try {
      const res = await call("POST", "/device/lookup", { userCode: input.value });
      go(res.redirect);
    } catch (err) {
      button.disabled = false;
      if (err.status === 401) {
        // Signed out meanwhile: the page sends to the login, then back here with the code
        const back = new URL(location.href);
        back.searchParams.set("user_code", input.value);
        return location.assign(back.href);
      }
      if (err.status === 404) return fail("Unknown or expired code: check the code shown on your device.");
      if (err.status === 429) return fail("Too many attempts: try again later.");
      fail("Something went wrong (" + (err.status || "network error") + "): try again.");
    }
  });
})();
`;

/**
 * Device code entry page
 * @param apiBase - path of the OAuthServer routes of the browser operations (`<apiBase>/device/lookup`)
 * @param userCode - untrusted code to prefill
 * @param nonce - nonce of the page script
 * @returns the HTML document
 */
export function deviceHtml(apiBase: string, userCode: string | undefined, nonce: string): string {
  return renderPage(
    "Connect a device",
    `<main id="app" data-api="${escapeHtml(apiBase)}"><h1>Connect a device</h1>` +
      `<p class="muted">Enter the code shown on your device.</p>` +
      `<form id="device"><p><input id="code" type="text" name="user_code" autocomplete="off" autocapitalize="characters"` +
      ` spellcheck="false" required maxlength="32" value="${escapeHtml(userCode ?? "")}"></p>` +
      `<div class="actions"><button id="submit" class="primary" type="submit">Continue</button></div></form>` +
      `<p id="status" class="muted"></p></main>`,
    DEVICE_SCRIPT,
    nonce
  );
}

/**
 * Result page of a flow
 * @param status - `success` or `error`
 * @param error - untrusted error code
 * @returns the HTML document
 */
export function resultHtml(status: string, error?: string): string {
  const success = status === "success";
  return renderPage(
    success ? "Signed in" : "Sign-in failed",
    `<main><h1>${
      success ? "Signed in — you can close this window" : `Sign-in failed: ${escapeHtml(error || "unknown error")}`
    }</h1></main>`
  );
}

/**
 * Error page
 * @param message - message
 * @returns the HTML document
 */
export function errorHtml(message: string): string {
  return renderPage("Error", `<main><h1>Error</h1><p class="error">${escapeHtml(message)}</p></main>`);
}
