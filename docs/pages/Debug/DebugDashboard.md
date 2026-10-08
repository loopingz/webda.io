---
sidebar_position: 1
---

# Debug dashboard & telemetry

`webda debug` starts your application with a debug server next to it (port `18181` by default). The debug server
exposes what the running application is made of — models and their relations, services and their configuration,
operations with their schemas, the live request log with captured headers and bodies, the application logs and the
resolved configuration — and streams updates over a websocket.

Two front-ends read it:

- the terminal UI, the default of `webda debug`;
- the web dashboard, with `webda debug --web`.

:::danger Upgrade @webda/debug

`@webda/debug` releases up to **4.0.0-beta.5** have no session token, trust every `*.webda.io` origin and listen on
all network interfaces. While such a server runs, any script on webda.io (including the site's analytics) and any
machine on your network can read your application's configuration and captured requests. Upgrade to 4.0.0-beta.6
or later, which requires a per-session token, binds to loopback only and trusts `https://webda.io` exactly.

:::

## Hosted or local

```bash
webda debug --web            # opens https://webda.io/debug/?port=18181#token=…
webda debug --web --local    # opens http://127.0.0.1:18181/#code=… served by the debug server itself
webda debug --web --no-open  # prints the URL, does not open a browser
```

By default `--web` opens the dashboard hosted on this site. `/debug/` is a static page: it loads nothing but its
own script and stylesheet (a Content-Security-Policy on the page enforces it), and your browser talks directly to
the debug server on `127.0.0.1`. Nothing about your application transits through webda.io. The hosted dashboard is
always the latest version, while the `@webda/debug` package in your application may be older: the dashboard
detects the server's API version and tells you when an update is needed.

`--local` serves the same dashboard, bundled inside `@webda/debug`, from the debug port. It works offline and loads
no external resource. Use it when your browser refuses connections from an `https` page to `127.0.0.1` (some Safari
versions do), or when you prefer not to open a public site.

Both variants look like this documentation and follow its light / dark theme; the hosted one follows the site's
toggle, the local one has its own and follows your system preference by default.

`WEBDA_DEBUG_NO_BROWSER=1` suppresses the browser opening for scripted runs (CI, Playwright). `WEBDA_DEBUG_UI_URL`
points the hosted mode at another copy of the dashboard, for instance the docs dev server
(`http://localhost:3000/debug/`); that origin is then also allowed to call the debug API, which it is not otherwise.

## How the dashboard authenticates

Every `webda debug` run generates a random 256-bit session token. The debug API (`/api/*`) and the websocket refuse
any request without it; the server listens on `127.0.0.1` and `[::1]` only, accepts only loopback `Host` headers and
only the origins of this site (plus its own, for the local page).

- **Hosted:** the token travels in the URL fragment (`#token=…`), which browsers never send to any server. The page
  keeps it in memory only and removes it from the address bar immediately: nothing stored on the webda.io origin
  ever holds it. A reload therefore asks for the printed URL again — which every server restart requires anyway.
  The fragment does stay in your browser history and in the terminal that printed it; the token dies with the
  `webda debug` process.
- **Local:** the printed URL carries a single-use code (`#code=…`), valid for ten minutes. The page exchanges it
  once for the token on `POST /api/session`; the token is kept in memory and in the tab's sessionStorage of
  `http://127.0.0.1:<port>`, an origin where only the bundled dashboard runs, so that a reload keeps working. The
  debug server serves no page with the token in it: a plain `GET /` by another local process gets nothing. In
  hosted mode `GET /` only shows where the dashboard is.

If the dashboard reports that the token was refused, the debug server was restarted: run the command again and open
the new URL it prints.

## Telemetry

The documentation site uses Google Analytics 4 to count usage. Analytics are only built into the site when a
measurement id is configured, and run under Consent Mode v2: cookies are denied until you accept the banner, and
while denied only cookieless, anonymous pings are sent.

The hosted dashboard page itself runs no analytics script and no third-party code. Its usage events are relayed by
`postMessage` to a small page loaded in an iframe with `sandbox="allow-scripts"` (no `allow-same-origin`): that
relay runs in an opaque origin, cannot read the dashboard, its storage or the debug server, and is the only place
gtag runs. It validates every message against the same allowlist before forwarding it, and applies the consent
choice you made on the documentation pages. If gtag cannot work in that sandbox, analytics are simply lost; the
sandbox is never relaxed.

The events, with nothing identifying your application:

| Event                 | Parameters                                                               |
| --------------------- | ------------------------------------------------------------------------ |
| `debug_connected`     | `debug_api_version`, `framework_version` (a version number only), `mode` |
| `panel_open`          | `panel` (logs, models, services, operations, requests, config)           |
| `model_graph_view`    | —                                                                        |
| `request_detail_view` | —                                                                        |
| `config_view`         | —                                                                        |
| `operation_invoked`   | — (reserved for when operations can be executed from the form)           |
| `connection_failed`   | `reason` (mixed_content, unreachable, unauthorized, version)             |

Never sent: model, service or operation names, data, request contents, URLs, ports, query strings, tokens, or
anything you type. The dashboard enforces this allowlist in code on both sides of the relay, and unit tests guard it.

The `--local` dashboard sends nothing at all.

### Opting out

```bash
webda debug --web --no-telemetry
# or
WEBDA_TELEMETRY=0 webda debug --web
```

Either adds `telemetry=0` to the dashboard URL; the page then never creates the analytics iframe for that browser
tab and never reports an event.
