import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SnapshotRequest,
  SnapshotResponse,
  WatchEvent,
  WatchRequest
} from "../../protocol/index.js";

/**
 * How the OfflineClient reaches the SyncService operations
 */
export interface Transport {
  /**
   * Perform pull
   */
  pull(req: PullRequest): Promise<PullResponse>;
  /**
   * Push operation
   */
  push(req: PushRequest): Promise<PushResponse>;
  /**
   * Perform snapshot
   */
  snapshot(req: SnapshotRequest): Promise<SnapshotResponse>;
  /** Optional live hints; the client pulls on each */
  watch?(req: WatchRequest, signal: AbortSignal): AsyncIterable<WatchEvent>;
}

/**
 * A server answer that is not a success
 */
export class TransportError extends Error {
  /**
   * Create a new TransportError instance
   * @param status - HTTP-like status, 0 for network errors
   * @param message - error message
   */
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
