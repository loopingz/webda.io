/* eslint-disable @typescript-eslint/no-explicit-any */
import process from "process";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import { Duplex } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

// fileURLToPath: URL.pathname would give "/C:/..." on Windows
vi.spyOn(process, "cwd").mockReturnValue(fileURLToPath(new URL(".", import.meta.url)));

const activeServers = new Set<net.Server>();
const serverSockets = new WeakMap<net.Server, Set<{ client: Duplex; server: Duplex }>>();

const origListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (this: net.Server, ...args: any[]) {
  activeServers.add(this);
  if (!serverSockets.has(this)) {
    serverSockets.set(this, new Set());
  }
  const anyServer = this as any;
  if (!anyServer.__inProcessPatched) {
    anyServer.__inProcessPatched = true;
    const origCloseAll = anyServer.closeAllConnections?.bind(this);
    anyServer.closeAllConnections = () => {
      origCloseAll?.();
      const pairs = serverSockets.get(this);
      if (pairs) {
        for (const pair of [...pairs]) {
          pair.server.destroy();
          pair.client.destroy();
        }
        pairs.clear();
      }
    };
  }
  this.once("close", () => {
    activeServers.delete(this);
  });
  return origListen.apply(this, args as any);
};

function findServer(port: number): net.Server | undefined {
  const target = Number(port);
  for (const s of activeServers) {
    if (s.listening) {
      const addr = s.address();
      if (typeof addr === "object" && addr && addr.port === target) {
        return s;
      }
    }
  }
  return undefined;
}

function isLocalhost(host?: string): boolean {
  return !host || host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "0.0.0.0";
}

function createSocketEndpoint(port: number) {
  let peer: any;
  const pendingWrites: Array<() => void> = [];
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutMs = 0;

  const resetTimer = () => {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = undefined;
    }
    if (timeoutMs > 0 && !socket.destroyed) {
      timeoutTimer = setTimeout(() => {
        socket.emit("timeout");
      }, timeoutMs);
      timeoutTimer.unref?.();
    }
  };

  const flushPending = () => {
    while (pendingWrites.length > 0) {
      const cb = pendingWrites.shift()!;
      cb();
    }
  };

  const socket = new Duplex({
    highWaterMark: 64 * 1024,
    read() {
      resetTimer();
      flushPending();
    },
    write(chunk, _encoding, callback) {
      resetTimer();
      const buf = Buffer.from(chunk);
      setImmediate(() => {
        if (!peer || peer.destroyed) {
          callback();
          return;
        }
        const ok = peer.push(buf);
        if (ok) {
          callback();
        } else {
          peer.pendingWrites.push(callback);
        }
      });
    },
    final(callback) {
      setImmediate(() => {
        if (peer && !peer.destroyed) {
          peer.push(null);
        }
        callback();
      });
    },
    destroy(err, callback) {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }
      flushPending();
      if (peer && !peer.destroyed) {
        const peerRef = peer;
        peer = undefined;
        peerRef.push(null);
        setImmediate(() => {
          if (!peerRef.destroyed) {
            peerRef.destroy();
          }
        });
      }
      callback(err);
    }
  }) as any;

  socket.setMaxListeners(0);
  socket.pendingWrites = pendingWrites;
  socket.flushPending = flushPending;
  socket.setPeer = (p: any) => {
    peer = p;
  };
  socket.remoteAddress = "127.0.0.1";
  socket.remoteFamily = "IPv4";
  socket.remotePort = port;
  socket.localAddress = "127.0.0.1";
  socket.localPort = port;
  socket.address = () => ({ address: "127.0.0.1", family: "IPv4", port });
  socket.setTimeout = (ms: number, cb?: () => void) => {
    timeoutMs = ms;
    if (cb) {
      socket.once("timeout", cb);
    }
    resetTimer();
    return socket;
  };
  socket.setNoDelay = () => socket;
  socket.setKeepAlive = () => socket;
  socket.ref = () => socket;
  socket.unref = () => socket;

  return socket;
}

function createInProcessSocket(port: number, onConnect?: () => void): Duplex {
  const numPort = Number(port);
  const clientSocket = createSocketEndpoint(numPort);
  const serverSocket = createSocketEndpoint(numPort);
  clientSocket.setPeer(serverSocket);
  serverSocket.setPeer(clientSocket);

  const server = findServer(numPort);
  if (!server) {
    process.nextTick(() => {
      clientSocket.destroy(
        Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:${numPort}`), { code: "ECONNREFUSED" })
      );
    });
    return clientSocket;
  }

  const pairs = serverSockets.get(server);
  const pair = { client: clientSocket, server: serverSocket };
  pairs?.add(pair);
  const cleanup = () => pairs?.delete(pair);
  clientSocket.once("close", cleanup);
  serverSocket.once("close", cleanup);

  server.emit("connection", serverSocket);
  process.nextTick(() => {
    if (!clientSocket.destroyed) {
      clientSocket.emit("connect");
      clientSocket.emit("ready");
      onConnect?.();
    }
  });
  return clientSocket;
}

const origNetConnect = net.connect;
function patchedNetConnect(...args: any[]): any {
  const first = args[0];
  if (typeof first === "object" && first !== null && !first.path && isLocalhost(first.host || first.hostname)) {
    const cb = typeof args[1] === "function" ? args[1] : undefined;
    return createInProcessSocket(first.port || 80, cb);
  }
  if (typeof first === "number" && (typeof args[1] !== "string" || isLocalhost(args[1]))) {
    const cb = typeof args[1] === "function" ? args[1] : typeof args[2] === "function" ? args[2] : undefined;
    return createInProcessSocket(first, cb);
  }
  return (origNetConnect as any).apply(net, args);
}
net.connect = patchedNetConnect as any;
net.createConnection = patchedNetConnect as any;

const origHttpCreateConnection = http.Agent.prototype.createConnection;
http.Agent.prototype.createConnection = function (options: any, cb?: any) {
  if (isLocalhost(options.host || options.hostname)) {
    return createInProcessSocket(options.port || 80, cb) as any;
  }
  return origHttpCreateConnection.call(this, options, cb);
};

const origHttpsCreateConnection = https.Agent.prototype.createConnection;
https.Agent.prototype.createConnection = function (options: any, cb?: any) {
  if (isLocalhost(options.host || options.hostname)) {
    const raw = createInProcessSocket(options.port || 443);
    const tlsOpts = { ...options, socket: raw };
    if (tlsOpts.servername && net.isIP(tlsOpts.servername)) {
      delete tlsOpts.servername;
    }
    const tlsSocket = tls.connect(tlsOpts, cb);
    raw.on("error", (err: Error) => tlsSocket.destroy(err));
    return tlsSocket as any;
  }
  return origHttpsCreateConnection.call(this, options, cb);
};

const origHttp2Connect = http2.connect;
(http2 as any).connect = function (authority: string | URL, options?: any, listener?: any) {
  if (typeof options === "function") {
    listener = options;
    options = undefined;
  }
  const url = typeof authority === "string" ? new URL(authority) : authority;
  if (isLocalhost(url.hostname) && !options?.createConnection) {
    const patchedOptions = {
      ...options,
      createConnection: (u: URL, opts: any) => {
        const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
        const raw = createInProcessSocket(port);
        if (u.protocol === "https:") {
          const tlsOpts: any = {
            ...opts,
            ALPNProtocols: ["h2"],
            socket: raw
          };
          if (!net.isIP(u.hostname)) {
            tlsOpts.servername = u.hostname;
          } else {
            delete tlsOpts.servername;
          }
          const tlsSocket = tls.connect(tlsOpts);
          raw.on("error", (err: Error) => tlsSocket.destroy(err));
          return tlsSocket;
        }
        return raw as any;
      }
    };
    return origHttp2Connect.call(this, authority, patchedOptions, listener);
  }
  return origHttp2Connect.call(this, authority, options, listener);
};

const origFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const parsed = new URL(urlStr);
  if (parsed.protocol === "http:" && isLocalhost(parsed.hostname)) {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const reqHeaders: Record<string, string> = {};
    const srcHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    if (srcHeaders) {
      new Headers(srcHeaders as HeadersInit).forEach((v, k) => {
        reqHeaders[k] = v;
      });
    }
    let bodyBuffer: Buffer | undefined;
    if (init?.body !== undefined && init?.body !== null) {
      if (typeof init.body === "string") {
        bodyBuffer = Buffer.from(init.body);
      } else if (init.body instanceof Uint8Array || Buffer.isBuffer(init.body)) {
        bodyBuffer = Buffer.from(init.body);
      } else if (init.body instanceof ArrayBuffer) {
        bodyBuffer = Buffer.from(init.body);
      } else {
        bodyBuffer = Buffer.from(String(init.body));
      }
      reqHeaders["content-length"] ??= String(bodyBuffer.byteLength);
    }

    return new Promise<Response>((resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(init.signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      const req = http.request(
        {
          hostname: parsed.hostname,
          port: Number(parsed.port || 80),
          path: parsed.pathname + parsed.search,
          method,
          headers: reqHeaders
        },
        res => {
          const resHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) {
              for (const item of v) resHeaders.append(k, item);
            } else if (v !== undefined) {
              resHeaders.set(k, v);
            }
          }
          const status = res.statusCode ?? 200;
          const isNullBody = status === 204 || status === 205 || status === 304 || method.toUpperCase() === "HEAD";
          if (isNullBody) {
            res.resume();
            resolve(new Response(null, { status, statusText: res.statusMessage, headers: resHeaders }));
            return;
          }
          const bodyStream = new ReadableStream<Uint8Array>({
            start(controller) {
              res.on("data", (chunk: Buffer) => {
                try {
                  controller.enqueue(new Uint8Array(chunk));
                } catch {
                  // stream closed
                }
              });
              res.on("end", () => {
                try {
                  controller.close();
                } catch {
                  // stream closed
                }
              });
              res.on("error", err => {
                try {
                  controller.error(err);
                } catch {
                  // stream closed
                }
              });
              if (init?.signal) {
                init.signal.addEventListener(
                  "abort",
                  () => {
                    req.destroy();
                    res.destroy();
                    try {
                      controller.error(
                        init.signal!.reason ?? new DOMException("The operation was aborted.", "AbortError")
                      );
                    } catch {
                      // ignore
                    }
                  },
                  { once: true }
                );
              }
            },
            cancel() {
              req.destroy();
              res.destroy();
            }
          });
          resolve(new Response(bodyStream, { status, statusText: res.statusMessage, headers: resHeaders }));
        }
      );
      if (init?.signal) {
        init.signal.addEventListener(
          "abort",
          () => {
            req.destroy();
            reject(init.signal!.reason ?? new DOMException("The operation was aborted.", "AbortError"));
          },
          { once: true }
        );
      }
      req.on("error", reject);
      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  }
  return origFetch(input, init);
};

syncBuiltinESMExports();
