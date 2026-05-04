import { Page, Locator, expect } from "@playwright/test";

/**
 * Stable suffix shared by every fixture created during one Playwright run.
 * Tests append it to slugs / usernames so the names are unique even if the
 * dev server's MemoryStore wasn't reset between runs.
 */
export const RUN_ID = `${Date.now()}`;

/**
 * Generate a slug-shaped fixture key (lowercase letters, digits, hyphens).
 *
 * Used for `Tag.slug` and `Post.slug`, both of which validate against
 * `/^[a-z0-9-]+$/`. Underscores are rejected.
 */
export function fixtureSlug(tag: string): string {
  return `${tag}-${RUN_ID}`.toLowerCase();
}

/**
 * Generate a username-shaped fixture key (alphanumeric + underscore).
 *
 * Used for `User.username`, which validates against `/^[a-zA-Z0-9_]+$/` —
 * hyphens are rejected.
 */
export function fixtureUsername(tag: string): string {
  return `${tag}_${RUN_ID}`;
}

/**
 * Generic alphanumeric+underscore key safe for any free-form identifier.
 * Use when the field has no specific validation but uniqueness is needed.
 */
export function fixtureKey(tag: string): string {
  return fixtureUsername(tag);
}

/** Click one of the four top-nav buttons and wait for its panel to render. */
export async function gotoTab(page: Page, tab: "Posts" | "Users" | "Tags" | "Comments"): Promise<void> {
  await page.locator(".nav button", { hasText: tab }).click();
  await expect(page.locator(".nav button.active")).toHaveText(tab);
  // The newly-mounted panel always renders a "+ New X" button. Waiting for
  // it before returning gives the panel's `useEffect` initial fetch enough
  // time to settle so subsequent assertions see the loaded state.
  await expect(page.locator(".toolbar")).toBeVisible();
}

/** Wait for the success toast and return the message text. */
export async function waitForToast(page: Page, kind: "success" | "error" = "success"): Promise<string> {
  const toast = page.locator(`.toast.toast-${kind}`).first();
  await expect(toast).toBeVisible();
  const text = (await toast.textContent()) || "";
  // The toast auto-dismisses after 3s; explicitly wait for it to detach so
  // the next action (which may pop another toast) doesn't see a stale one.
  await toast.waitFor({ state: "hidden", timeout: 5000 });
  return text;
}

/**
 * Find the table row whose first cell with the `.mono` class matches `key`.
 * Used to grab a specific user/tag/post row by its slug / username / uuid.
 */
export function rowByKey(page: Page, key: string): Locator {
  return page.locator("tbody tr").filter({ has: page.locator("td.mono", { hasText: key }) });
}

/**
 * Pre-arm `confirm()` and `prompt()` dialogs so headless tests don't hang.
 *
 * - `confirm()` resolves to `true` so the underlying delete request runs.
 * - `prompt()` returns successive `promptValues`, one per call. If the
 *   handler runs out of values it returns the empty string.
 */
export async function autoAcceptDialogs(page: Page, promptValues: string[] = []): Promise<void> {
  let i = 0;
  page.on("dialog", async dialog => {
    if (dialog.type() === "prompt") {
      const v = i < promptValues.length ? promptValues[i++] : "";
      await dialog.accept(v);
    } else {
      await dialog.accept();
    }
  });
}

/**
 * Open the first form in the modal (the `+ New X` button creates one).
 * The modal layer is detected via `.modal-overlay`, which the form
 * components render around their content.
 */
export async function openNewModal(page: Page, label: string): Promise<Locator> {
  await page.locator(".toolbar button.btn-primary", { hasText: `+ New ${label}` }).click();
  const modal = page.locator(".modal");
  await expect(modal).toBeVisible();
  return modal;
}

/** Close any open modal by clicking the overlay's empty area. */
export async function closeModal(page: Page): Promise<void> {
  await page.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".modal")).toHaveCount(0);
}

/**
 * Locate a form field by its label text.
 *
 * The `htm` templates render `<label>` and `<input>` as siblings inside a
 * `.form-group`, with no `for`/`id` association — so `getByLabel` doesn't
 * pick them up. We anchor on the form-group whose `<label>` matches the
 * given text and return the first input/textarea/select inside it.
 *
 * Pass `parent` to scope the lookup to a specific modal instance (useful
 * when nested binary-block modals also render `.form-group` children).
 */
export function formField(parent: Locator | Page, label: string): Locator {
  const root = parent as Page & Locator;
  return root
    .locator(".form-group")
    .filter({ has: root.locator("label", { hasText: new RegExp(`^\\s*${label}\\s*$`) }) })
    .locator("input, textarea, select")
    .first();
}
