/**
 * API client for the blog-system REST endpoints.
 * All methods return parsed JSON or throw on error.
 */

const BASE = "";

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// Posts
export const posts = {
  list: (q = "") => request("PUT", "/posts", { q }),
  get: (slug) => request("GET", `/posts/${slug}`),
  create: (data) => request("POST", "/posts", data),
  update: (slug, data) => request("PUT", `/posts/${slug}`, data),
  patch: (slug, data) => request("PATCH", `/posts/${slug}`, data),
  delete: (slug) => request("DELETE", `/posts/${slug}`),
  publish: (slug, destination) => request("PUT", `/posts/${slug}/publish`, { destination }),
};

// Users
export const users = {
  list: (q = "") => request("PUT", "/users", { q }),
  get: (uuid) => request("GET", `/users/${uuid}`),
  create: (data) => request("POST", "/users", data),
  update: (uuid, data) => request("PUT", `/users/${uuid}`, data),
  patch: (uuid, data) => request("PATCH", `/users/${uuid}`, data),
  delete: (uuid) => request("DELETE", `/users/${uuid}`),
};

// Tags
export const tags = {
  list: (q = "") => request("PUT", "/tags", { q }),
  get: (slug) => request("GET", `/tags/${slug}`),
  create: (data) => request("POST", "/tags", data),
  update: (slug, data) => request("PUT", `/tags/${slug}`, data),
  delete: (slug) => request("DELETE", `/tags/${slug}`),
};

// Comments
export const comments = {
  list: (q = "") => request("PUT", "/comments", { q }),
  get: (uuid) => request("GET", `/comments/${uuid}`),
  create: (data) => request("POST", "/comments", data),
  update: (uuid, data) => request("PUT", `/comments/${uuid}`, data),
  delete: (uuid) => request("DELETE", `/comments/${uuid}`),
};
