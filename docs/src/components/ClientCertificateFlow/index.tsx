import React from "react";
import DiagramFigure from "../DiagramFigure";

export default function ClientCertificateFlow() {
  return (
    <DiagramFigure
      src="/img/concepts/client-certificate.svg"
      width={1200}
      height={940}
      label="Client certificate authentication flow"
      alt="Clients present a certificate either directly to Webda HttpServer over TLS or through a reverse proxy that verifies it. Webda accepts forwarded certificate headers only from trusted proxies. HttpContext exposes the certificate. In login mode SessionManager uses CertificateProvider to resolve an accepted certificate to a user and create a stateless session. Factor mode requires an existing session for that same user."
    >
      Certificate login path shown. Proxy mode requires both certificate verification at the proxy and restricted
      network access to Webda.
    </DiagramFigure>
  );
}
