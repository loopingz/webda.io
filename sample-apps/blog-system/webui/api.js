/**
 * API client for the blog-system REST endpoints.
 * All methods return parsed JSON or throw on error.
 */

import SparkMD5 from "https://esm.sh/spark-md5@3.0.2";

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

// ---------- Binary helpers ----------
//
// Two upload paths are exposed:
//
//  - Direct (POST multipart): the framework hashes server-side and stores.
//  - Challenge (PUT JSON): the client computes MD5 + a "WEBDA"+bytes
//    challenge MD5 first; the server replies either `{done:true, ...}`
//    (already known to platform — instant link, the demo-able shortcut)
//    or `{done:false, url, method, headers, md5}` (PUT bytes to that URL).
//
// If the configured BinaryService doesn't return a signed URL on the
// challenge response (e.g. some in-memory dev binary), we fall back to
// a direct POST so the file still ends up stored.

/** MD5 hex of an ArrayBuffer, optionally with a leading "WEBDA" prefix. */
async function md5Of(buf, withWebdaPrefix = false) {
  const spark = new SparkMD5.ArrayBuffer();
  if (withWebdaPrefix) {
    spark.append(new TextEncoder().encode("WEBDA").buffer);
  }
  spark.append(buf);
  return spark.end();
}

/** Compute both hashes the framework expects for a challenge upload. */
async function fileHashes(file) {
  const buf = await file.arrayBuffer();
  return {
    hash: await md5Of(buf, false),
    challenge: await md5Of(buf, true)
  };
}

export const binaries = {
  /**
   * Direct multipart upload (POST). Framework hashes server-side and stores.
   * For Binary (single) this replaces the existing one; for Binaries
   * (collection) this pushes a new item.
   */
  async uploadDirect(slug, attribute, file) {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return request("POST", `/posts/${slug}/${attribute}`, fd);
  },

  /**
   * Challenge upload flow. Returns one of:
   *  { done: true,  hash }                    — already on platform, instant link
   *  { done: false, hash, viaSignedUrl: true} — uploaded bytes to a signed URL
   *  { done: false, hash, viaSignedUrl: false}— fell back to direct POST
   */
  async uploadChallenge(slug, attribute, file) {
    const { hash, challenge } = await fileHashes(file);
    const body = {
      hash,
      challenge,
      name: file.name,
      size: file.size,
      mimetype: file.type || "application/octet-stream",
      metadata: {}
    };
    let result;
    try {
      result = await request("PUT", `/posts/${slug}/${attribute}`, body);
    } catch (e) {
      // The challenge endpoint may be unsupported by the configured BinaryService
      // (e.g. an in-memory store that throws NotFound). Fall back to direct POST
      // so the file still gets stored — the demo of "done:true skip" simply
      // isn't available without a challenge-capable BinaryService.
      await binaries.uploadDirect(slug, attribute, file);
      return { done: false, hash, viaSignedUrl: false, fallback: true, error: e.message };
    }
    // No body returned at all → server returned undefined (already linked, single-binary case).
    if (result === null || result === undefined) {
      return { done: true, hash };
    }
    if (result.done) {
      return { done: true, hash };
    }
    // Not known: server may have returned a signed URL to PUT the bytes to.
    const target = result.url || result.signedUrl || result.Location;
    if (target) {
      const headers = {};
      if (result.headers) Object.assign(headers, result.headers);
      const method = result.method || "PUT";
      if (method === "PUT" && !headers["Content-Type"]) {
        headers["Content-Type"] = file.type || "application/octet-stream";
      }
      const upload = await fetch(target, { method, headers, body: file });
      if (!upload.ok) {
        const text = await upload.text().catch(() => "");
        throw new Error(`Upload failed: ${upload.status} ${text}`);
      }
      return { done: false, hash, viaSignedUrl: true };
    }
    // No signed URL, not done: fall back to direct.
    await binaries.uploadDirect(slug, attribute, file);
    return { done: false, hash, viaSignedUrl: false };
  },

  /** Set metadata on a single Binary (Binary, not Binaries). */
  async setMetadata(slug, attribute, hash, metadata) {
    return request("PUT", `/posts/${slug}/${attribute}/${hash}`, metadata);
  },

  /** Set metadata on one item of a Binaries collection. */
  async setItemMetadata(slug, attribute, index, hash, metadata) {
    return request("PUT", `/posts/${slug}/${attribute}/${index}/${hash}`, metadata);
  },

  /** Get the JSON URL descriptor for a Binary (or one item of a Binaries). */
  async getUrl(slug, attribute, index) {
    const path = index !== undefined
      ? `/posts/${slug}/${attribute}/${index}/url`
      : `/posts/${slug}/${attribute}/url`;
    return request("GET", path);
  },

  /** Build the GET-stream URL for inline use (e.g. <img src=…>). */
  streamUrl(slug, attribute, index) {
    return index !== undefined
      ? `/posts/${slug}/${attribute}/${index}`
      : `/posts/${slug}/${attribute}`;
  },

  /** Delete a single Binary. */
  async delete(slug, attribute, hash) {
    return request("DELETE", `/posts/${slug}/${attribute}/${hash}`);
  },

  /** Delete one item of a Binaries collection. */
  async deleteItem(slug, attribute, index, hash) {
    return request("DELETE", `/posts/${slug}/${attribute}/${index}/${hash}`);
  }
};
