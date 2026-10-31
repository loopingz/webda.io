import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { FAKE_KUBECONFIG } from "./fixture.js";

/**
 * A stored custom resource
 */
export type FakeResource = {
  apiVersion: string;
  kind: string;
  metadata: Record<string, any>;
  spec?: any;
  status?: any;
  [key: string]: any;
};

/**
 * In-memory Kubernetes API server for custom resources
 *
 * Supports, on `/apis/<group>/<version>[/namespaces/<ns>]/<plural>[/<name>[/status]]`: list (label selectors with
 * `=`, `==`, `!=`, `in`, `notin`, `key`, `!key`; `limit` and `continue`), get, create, replace (optimistic concurrency
 * on `resourceVersion`, `generation` bumped on spec changes), status replace, delete (`preconditions.resourceVersion`)
 * and watch. Every request is recorded in `requests`.
 */
export class FakeApiServer {
  server?: Server;
  /** resources by `<group>/<plural>/<namespace>/<name>` */
  resources = new Map<string, FakeResource>();
  resourceVersion = 0;
  requests: { method: string; path: string; query: URLSearchParams }[] = [];
  watches: { prefix: string; res: ServerResponse; selector?: string }[] = [];
  /** status codes answered to the next requests, or to the next requests of a method */
  failures: (number | { method: string; code: number })[] = [];

  /**
   * Start listening
   * @returns a kubeconfig pointing to the server
   */
  async start(): Promise<any> {
    this.server = createServer((req, res) => {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        try {
          this.handle(req, res, body ? JSON.parse(body) : undefined);
        } catch {
          this.send(res, 500, this.status(500, "InternalError", "Internal server error"));
        }
      });
    });
    await new Promise<void>(resolve => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = <any>this.server.address();
    return {
      ...FAKE_KUBECONFIG,
      clusters: [{ name: "fake", server: `http://127.0.0.1:${port}`, skipTLSVerify: true }]
    };
  }

  /**
   * Stop listening
   */
  async stop() {
    this.watches.forEach(w => w.res.end());
    this.server?.closeAllConnections();
    await new Promise(resolve => this.server?.close(resolve));
  }

  /**
   * Resources of a type
   * @param group - the API group
   * @param plural - the plural
   * @returns the resources
   */
  list(group: string, plural: string): FakeResource[] {
    return [...this.resources.entries()].filter(([key]) => key.startsWith(`${group}/${plural}/`)).map(([, r]) => r);
  }

  /**
   * A Status body
   * @param code - HTTP status code
   * @param reason - Kubernetes reason
   * @param message - message
   * @returns the Status
   */
  protected status(code: number, reason: string, message: string) {
    return { kind: "Status", apiVersion: "v1", status: "Failure", code, reason, message };
  }

  /**
   * Send a JSON response
   * @param res - the response
   * @param code - HTTP status code
   * @param body - the body
   */
  protected send(res: ServerResponse, code: number, body: any) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  /**
   * Whether labels match a selector
   * @param labels - the labels
   * @param selector - the label selector
   * @returns true if they match
   */
  static matches(labels: Record<string, string> = {}, selector?: string | null): boolean {
    if (!selector) return true;
    // Split on commas outside parentheses
    const requirements = selector.match(/([^,(]+(\([^)]*\))?)+/g) ?? [];
    return requirements.every(raw => {
      const requirement = raw.trim();
      let match = requirement.match(/^(\S+)\s+(in|notin)\s+\((.*)\)$/);
      if (match) {
        const values = match[3].split(",").map(v => v.trim());
        const has = match[1] in labels && values.includes(labels[match[1]]);
        return match[2] === "in" ? has : !has;
      }
      match = requirement.match(/^([^!=]+)(==|=|!=)(.*)$/);
      if (match) {
        const equal = labels[match[1]] === match[3];
        return match[2] === "!=" ? !equal : equal;
      }
      if (requirement.startsWith("!")) return !(requirement.slice(1) in labels);
      return requirement in labels;
    });
  }

  /**
   * Answer a request
   * @param req - the request
   * @param res - the response
   * @param body - the parsed body
   * @returns nothing, the answer is sent
   */
  protected handle(req: IncomingMessage, res: ServerResponse, body: any) {
    const url = new URL(req.url!, "http://localhost");
    this.requests.push({ method: req.method!, path: url.pathname, query: url.searchParams });
    const index = this.failures.findIndex(f => typeof f === "number" || f.method === req.method);
    if (index >= 0) {
      const [failure] = this.failures.splice(index, 1);
      const code = typeof failure === "number" ? failure : failure.code;
      return this.send(res, code, this.status(code, "Injected", "Injected failure"));
    }
    const match = url.pathname.match(
      /^\/apis\/([^/]+)\/([^/]+)(?:\/namespaces\/([^/]+))?\/([^/]+)(?:\/([^/]+))?(?:\/(status))?$/
    );
    if (!match) return this.send(res, 404, this.status(404, "NotFound", "Unknown path"));
    const [, group, version, namespace = "", plural, name, subresource] = match;
    const prefix = `${group}/${plural}/${namespace}`;
    const key = `${prefix}/${name}`;
    const existing = name ? this.resources.get(key) : undefined;
    const notFound = () => this.send(res, 404, this.status(404, "NotFound", `${plural} "${name}" not found`));

    if (req.method === "GET" && !name) {
      if (url.searchParams.get("watch") === "true") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.flushHeaders();
        this.watches.push({ prefix, res, selector: url.searchParams.get("labelSelector") ?? undefined });
        return;
      }
      const items = [...this.resources.entries()]
        .filter(([k]) => (namespace ? k.startsWith(`${prefix}/`) : k.startsWith(`${group}/${plural}/`)))
        .map(([, r]) => r)
        .filter(r => FakeApiServer.matches(r.metadata.labels, url.searchParams.get("labelSelector")))
        .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
      const start = parseInt(url.searchParams.get("continue") || "0");
      const limit = parseInt(url.searchParams.get("limit") || "0") || items.length;
      const page = items.slice(start, start + limit);
      const next = start + limit < items.length ? `${start + limit}` : undefined;
      return this.send(res, 200, {
        apiVersion: `${group}/${version}`,
        kind: "List",
        metadata: { resourceVersion: `${this.resourceVersion}`, ...(next ? { continue: next } : {}) },
        items: page
      });
    }
    if (req.method === "GET") {
      return existing ? this.send(res, 200, existing) : notFound();
    }
    if (req.method === "POST") {
      const created = body.metadata.name;
      if (this.resources.has(`${prefix}/${created}`)) {
        return this.send(res, 409, this.status(409, "AlreadyExists", `${plural} "${created}" already exists`));
      }
      const resource: FakeResource = {
        ...body,
        metadata: {
          ...body.metadata,
          ...(namespace ? { namespace } : {}),
          uid: `uid-${created}`,
          generation: 1,
          creationTimestamp: new Date().toISOString(),
          resourceVersion: `${++this.resourceVersion}`
        }
      };
      // The status subresource ignores the status on create
      delete resource.status;
      if (plural === "customresourcedefinitions") {
        resource.status = { conditions: [{ type: "Established", status: "True" }] };
      }
      this.resources.set(`${prefix}/${created}`, resource);
      this.notify(prefix, "ADDED", resource);
      return this.send(res, 201, resource);
    }
    if (req.method === "PUT") {
      if (!existing) return notFound();
      if (body.metadata?.resourceVersion && body.metadata.resourceVersion !== existing.metadata.resourceVersion) {
        return this.send(res, 409, this.status(409, "Conflict", "the object has been modified"));
      }
      const updated: FakeResource = subresource
        ? { ...existing, status: body.status }
        : { ...body, status: existing.status };
      updated.metadata = {
        ...(subresource ? existing.metadata : body.metadata),
        uid: existing.metadata.uid,
        creationTimestamp: existing.metadata.creationTimestamp,
        ...(existing.metadata.deletionTimestamp ? { deletionTimestamp: existing.metadata.deletionTimestamp } : {}),
        generation:
          !subresource && JSON.stringify(body.spec) !== JSON.stringify(existing.spec)
            ? existing.metadata.generation + 1
            : existing.metadata.generation,
        resourceVersion: `${++this.resourceVersion}`
      };
      if (updated.metadata.deletionTimestamp && !updated.metadata.finalizers?.length) {
        this.resources.delete(key);
        this.notify(prefix, "DELETED", updated);
      } else {
        this.resources.set(key, updated);
        this.notify(prefix, "MODIFIED", updated);
      }
      return this.send(res, 200, updated);
    }
    if (req.method === "DELETE") {
      if (!existing) return notFound();
      const expected = body?.preconditions?.resourceVersion;
      if (expected && expected !== existing.metadata.resourceVersion) {
        return this.send(res, 409, this.status(409, "Conflict", "precondition failed"));
      }
      if (existing.metadata.finalizers?.length) {
        existing.metadata.deletionTimestamp ??= new Date().toISOString();
        existing.metadata.resourceVersion = `${++this.resourceVersion}`;
        this.notify(prefix, "MODIFIED", existing);
        return this.send(res, 200, existing);
      }
      this.resources.delete(key);
      this.notify(prefix, "DELETED", existing);
      return this.send(res, 200, this.status(200, "Success", "deleted"));
    }
    this.send(res, 405, this.status(405, "MethodNotAllowed", req.method!));
  }

  /**
   * Send a watch event
   * @param prefix - `<group>/<plural>/<namespace>` of the resource
   * @param type - the event type
   * @param object - the resource
   */
  protected notify(prefix: string, type: string, object: FakeResource) {
    for (const watch of this.watches) {
      const [group, plural, namespace] = watch.prefix.split("/");
      const [g, p] = prefix.split("/");
      if (g !== group || p !== plural || (namespace && prefix !== watch.prefix)) continue;
      if (!FakeApiServer.matches(object.metadata.labels, watch.selector)) continue;
      watch.res.write(JSON.stringify({ type, object }) + "\n");
    }
  }
}
