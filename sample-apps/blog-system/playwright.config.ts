import { defineConfig, devices } from "@playwright/test";

const PORT = 18080;
const BASE_URL = `https://localhost:${PORT}`;

export default defineConfig({
  testDir: "./test/e2e",
  // MemoryStore is shared across the dev server's lifetime; running specs in
  // parallel against one server creates fixture-name collisions. Sequential
  // execution keeps the test data deterministic without per-test resets.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // Self-signed cert from `webda debug`; the suite hits localhost only.
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Set `PW_SLOWMO=500` to watch each Playwright action animate
        // (button clicks, fills, etc.) with a 500ms gap. Pair with
        // `--headed` to see the browser. `0` (default) runs at full speed.
        launchOptions: { slowMo: Number(process.env.PW_SLOWMO || 0) }
      }
    }
  ],
  webServer: {
    // Use `webda debug --web` (no TUI) since the TUI variant requires a
    // real tty and Playwright's `webServer` runs the child with stdio
    // pipes. `WEBDA_DEBUG_NO_BROWSER=1` keeps the dev server from
    // auto-opening a Chrome tab — Playwright manages its own browser.
    // The build step is required because the dev server expects
    // `webda.module.json` and `.webda/app.proto` to exist on disk.
    // We point `url` at `/admin/` (not `/`) because that route is
    // unambiguously the admin UI; the framework's `/` handler returns
    // 404 which Playwright accepts as "alive" but `/admin/` is a stronger
    // ready signal.
    command: "pnpm run build && WEBDA_DEBUG_NO_BROWSER=1 pnpm run debug:web",
    url: `${BASE_URL}/admin/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    ignoreHTTPSErrors: true,
    stdout: "pipe",
    stderr: "pipe"
  }
});
