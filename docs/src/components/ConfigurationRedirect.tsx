import React, { useEffect } from "react";

/**
 * The debug panels moved from `/configuration/*` to `/debug/`, a static page
 * outside the Docusaurus app: a full navigation replaces the router redirect.
 *
 * @returns a short notice shown while the browser navigates
 */
export default function ConfigurationRedirect(): React.JSX.Element {
  useEffect(() => {
    window.location.replace("/debug/");
  }, []);
  return (
    <p style={{ padding: "2rem" }}>
      The debug dashboard moved to <a href="pathname:///debug/">/debug/</a>.
    </p>
  );
}
