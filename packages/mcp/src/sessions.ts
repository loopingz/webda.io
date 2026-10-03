import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { useLog } from "@webda/workout";

/**
 * An open MCP HTTP session
 */
export interface McpSessionEntry {
  /**
   * Mcp-Session-Id
   */
  id: string;
  /**
   * SDK server bound to this session
   */
  server: Server;
  /**
   * SDK transport bound to this session
   */
  transport: { close(): Promise<void> };
  /**
   * User who initialized the session (undefined = anonymous)
   */
  userId?: string;
  /**
   * Last activity timestamp (ms)
   */
  lastSeen: number;
}

/**
 * In-memory MCP sessions with idle eviction
 */
export class McpSessionManager {
  protected sessions: Map<string, McpSessionEntry> = new Map();

  /**
   * @param timeoutMs - idle time before eviction
   * @param now - clock (injectable for tests)
   */
  constructor(
    protected timeoutMs: number,
    protected now: () => number = () => Date.now()
  ) {}

  /**
   * @param entry - session to track
   */
  add(entry: McpSessionEntry): void {
    entry.lastSeen = this.now();
    this.sessions.set(entry.id, entry);
  }

  /**
   * Find a session and refresh its activity
   * @param id - session id
   * @returns the session or undefined
   */
  get(id: string): McpSessionEntry | undefined {
    const entry = this.sessions.get(id);
    if (entry) {
      entry.lastSeen = this.now();
    }
    return entry;
  }

  /**
   * @param id - session id to forget (does not close it)
   */
  remove(id: string): void {
    this.sessions.delete(id);
  }

  /**
   * @returns all sessions
   */
  all(): McpSessionEntry[] {
    return [...this.sessions.values()];
  }

  /**
   * Close and remove sessions idle longer than the timeout
   * @returns number of evicted sessions
   */
  async evictIdle(): Promise<number> {
    const limit = this.now() - this.timeoutMs;
    const idle = this.all().filter(e => e.lastSeen < limit);
    for (const entry of idle) {
      await this.close(entry);
    }
    return idle.length;
  }

  /**
   * Close and remove the least recently used session
   * @returns the evicted session id, or undefined when there is none
   */
  async evictOldest(): Promise<string | undefined> {
    let oldest: McpSessionEntry | undefined;
    for (const entry of this.sessions.values()) {
      if (!oldest || entry.lastSeen < oldest.lastSeen) {
        oldest = entry;
      }
    }
    if (!oldest) {
      return undefined;
    }
    await this.close(oldest);
    return oldest.id;
  }

  /**
   * Close every session
   */
  async closeAll(): Promise<void> {
    for (const entry of this.all()) {
      await this.close(entry);
    }
  }

  /**
   * @param entry - session to close and remove
   */
  protected async close(entry: McpSessionEntry): Promise<void> {
    this.sessions.delete(entry.id);
    try {
      await entry.transport.close();
      await entry.server.close();
    } catch (err) {
      useLog("WARN", "Failed to close MCP session", entry.id, err);
    }
  }
}
