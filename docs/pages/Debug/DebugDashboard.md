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

## Hosted or local

```bash
webda debug --web            # opens https://webda.io/debug/?port=18181#token=…
webda debug --web --local    # opens http://localhost:18181/ served by the debug server itself
webda debug --web --no-open  # prints the URL, does not open a browser
```

By default `--web` opens the dashboard hosted on this site. The page is static: your browser talks directly to the
debug server on `localhost`, nothing about your application transits through webda.io. The hosted dashboard is
always the latest version, while the `@webda/debug` package in your application may be older: the dashboard
detects the server's API version and tells you when an update is needed.

`--local` serves the same dashboard, bundled inside `@webda/debug`, from the debug port. It works offline and loads
no external resource. Use it when your browser refuses connections from an `https` page to `localhost` (some Safari
versions do), or when you prefer not to open a public site.

Both variants look like this documentation and follow its light / dark theme; the local one has its own toggle and
follows your system preference by default.

`WEBDA_DEBUG_NO_BROWSER=1` suppresses the browser opening for scripted runs (CI, Playwright), and
`WEBDA_DEBUG_UI_URL` points the hosted mode at another copy of the dashboard (for instance the docs dev server,
`http://localhost:3000/debug/`).

## How the dashboard authenticates

Every `webda debug` run generates a random 256-bit session token. The debug API (`/api/*`) and the websocket refuse
any request without it, and the server only accepts requests from loopback hosts and from the origins of this site.
The token travels in the URL fragment (`#token=…`), which browsers never send to any server; the page stores it for
the tab and removes it from the address bar immediately. In `--local` mode the debug server injects the token into
the page it serves, and the URL carries none.

If the dashboard reports that the token was refused, the debug server was restarted: run the command again and open
the new URL it prints.

## Telemetry

The documentation site uses Google Analytics 4 to count usage. Analytics are only built into the site when a
measurement id is configured, and run under Consent Mode v2: cookies are denied until you accept the banner, and
while denied only cookieless, anonymous pings are sent.

The hosted dashboard reports a handful of usage events, with nothing identifying your application:

| Event                 | Parameters                                                       |
| --------------------- | ---------------------------------------------------------------- |
| `debug_connected`     | `debug_api_version`, `framework_version`, `mode`                 |
| `panel_open`          | `panel` (logs, models, services, operations, requests, config)   |
| `model_graph_view`    | —                                                                |
| `request_detail_view` | —                                                                |
| `config_view`         | —                                                                |
| `operation_invoked`   | — (reserved for when operations can be executed from the form)   |
| `connection_failed`   | `reason` (mixed_content, unreachable, unauthorized, version)     |

Never sent: model, service or operation names, data, request contents, URLs, query strings, tokens, or anything you
type. The dashboard enforces this allowlist in code, and a unit test guards it.

The `--local` dashboard sends nothing at all.

### Opting out

```bash
webda debug --web --no-telemetry
# or
WEBDA_TELEMETRY=0 webda debug --web
```

Either adds `telemetry=0` to the dashboard URL; the page then disables Google Analytics for that browser tab and
never reports an event.
