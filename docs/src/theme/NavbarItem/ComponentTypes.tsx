"use strict";

/**
 * Extends the default Docusaurus NavbarItem component type registry with a
 * custom `"custom-app-link"` type that renders the connection-aware
 * "My Application" navbar item.
 *
 * This is an "unsafe" swizzle but the approach is documented by Docusaurus:
 * https://docusaurus.io/docs/swizzling#wrapping
 *
 * If this swizzle becomes incompatible with a future Docusaurus release, the
 * fallback is to switch the navbar config item back to a plain `to:` link and
 * remove this file — the connection dot will be lost but nothing else breaks.
 */

import DefaultComponentTypes from "@theme-original/NavbarItem/ComponentTypes";
import { AppNavbarItem } from "@site/src/debug/AppNavbarItem";

// Merge the default component map with our custom type.
const ComponentTypes = {
  ...DefaultComponentTypes,
  // Used in docusaurus.config.ts:
  //   { type: "custom-app-link", position: "right" }
  "custom-app-link": AppNavbarItem
} as typeof DefaultComponentTypes & { "custom-app-link": typeof AppNavbarItem };

export default ComponentTypes;
