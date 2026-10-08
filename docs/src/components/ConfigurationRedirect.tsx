import React from "react";
import { Redirect } from "@docusaurus/router";

/**
 * The debug panels moved from `/configuration/*` to `/debug/`.
 *
 * @returns a client-side redirect
 */
export default function ConfigurationRedirect(): React.JSX.Element {
  return <Redirect to="/debug/" />;
}
