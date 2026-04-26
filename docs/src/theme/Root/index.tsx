"use strict";

/**
 * Swizzled Root component — wraps the entire Docusaurus app with the
 * DebugConnectionProvider so that:
 *   - The Configuration panels (models, services, operations, logs, requests)
 *   - The "My Application" navbar item (AppNavbarItem)
 * all share a single polling loop and WebSocket connection.
 *
 * Docusaurus treats theme/Root/index.tsx as a "safe" swizzle (wrap mode).
 * No --eject or unsafe flag is required.
 */

import React from "react";
import { DebugConnectionProvider } from "@site/src/debug/DebugConnectionContext";

interface RootProps {
  children: React.ReactNode;
}

// Default export is required by Docusaurus theme swizzling.
export default function Root({ children }: RootProps): JSX.Element {
  return (
    <DebugConnectionProvider>
      {children}
    </DebugConnectionProvider>
  );
}
