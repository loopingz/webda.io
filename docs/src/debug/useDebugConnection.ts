"use strict";

/**
 * Hook that returns the current debug daemon connection state.
 *
 * Requires a <DebugConnectionProvider> ancestor in the tree.
 */

import { useContext } from "react";
import { DebugConnectionContext, type DebugConnectionState } from "./DebugConnectionContext";

/**
 * Returns the current {@link DebugConnectionState} from the nearest
 * {@link DebugConnectionContext} provider.
 *
 * @example
 * ```tsx
 * function MyPanel() {
 *   const { connected, info } = useDebugConnection();
 *   if (!connected) return <p>No daemon connected.</p>;
 *   return <p>Connected to {info?.name}</p>;
 * }
 * ```
 */
export function useDebugConnection(): DebugConnectionState {
  return useContext(DebugConnectionContext);
}
