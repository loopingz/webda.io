import { test, expect, Page } from "@playwright/test";
import { autoAcceptDialogs, fixtureSlug, formField, gotoTab, rowByKey, waitForToast } from "./helpers.js";
import { TINY_PNG } from "./fixtures/tiny-png.js";

/**
 * Create a draft post and re-open it in Edit mode so the binary blocks are
 * actually mounted.
 *
 * The PostForm component reuses one `useState(initial)` slot for its `post`
 * snapshot. After `Create`, the panel switches `editing` from `"new"` to
 * the created object — but the existing PostForm instance keeps its initial
 * `post = null` because `useState`'s argument is only honored on first
 * mount. So the in-modal binary controls (which are gated on `post?.slug`)
 * never render until the modal is closed and re-opened.
 *
 * Closing first, then clicking Edit on the row, sidesteps the bug.
 */
async function seedPost(page: Page, slug: string, title: string): Promise<void> {
  await page.locator(".toolbar button.btn-primary", { hasText: "+ New Post" }).click();
  await formField(page, "Title").fill(title);
  await formField(page, "Slug").fill(slug);
  await formField(page, "Content").fill("Body for binary upload e2e tests.");
  await page.locator(".modal-actions .btn-primary", { hasText: "Create" }).click();
  await waitForToast(page);
  // The modal stayed open in Edit mode but with empty `post` state — close
  // it and re-open from the row so the binary blocks render.
  await page.locator(".modal-actions .btn-ghost", { hasText: "Close" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
  await rowByKey(page, slug).locator("button", { hasText: "Edit" }).click();
  await expect(page.locator(".modal h2")).toHaveText("Edit Post");
  // Wait for the binary blocks to mount before returning.
  await expect(page.locator(".binary-block").first()).toBeVisible();
}

/**
 * Locator for the `<div class="binary-block">` whose label matches `label`.
 * The mainImage block reads "Main image", the images block reads
 * "Additional images" — both wrap their controls in `.binary-block`.
 */
function blockWithLabel(page: Page, label: string) {
  return page.locator(".binary-block").filter({ has: page.locator(".binary-label", { hasText: label }) });
}

async function deletePost(page: Page, slug: string): Promise<void> {
  await page.locator(".modal-actions .btn-ghost", { hasText: "Close" }).click().catch(() => {});
  await rowByKey(page, slug).locator("button", { hasText: "Delete" }).click();
  await waitForToast(page);
}

test.describe("Posts.mainImage (single Binary)", () => {
  let slug: string;

  test.beforeEach(async ({ page }) => {
    await autoAcceptDialogs(page);
    await page.goto("/admin/");
    await gotoTab(page, "Posts");
    slug = fixtureSlug("post-binary");
    await seedPost(page, slug, "Binary E2E");
  });

  test.afterEach(async ({ page }) => {
    await deletePost(page, slug);
  });

  test("uploads a file via direct POST and shows attached state", async ({ page }) => {
    const block = blockWithLabel(page, "Main image");

    // Pick the file then click the direct upload button. The block's
    // `<input type="file">` is the only file picker inside it.
    await block.locator('input[type="file"]').setInputFiles({
      name: "tiny.png",
      mimeType: "image/png",
      buffer: TINY_PNG
    });
    await block.locator("button", { hasText: "Upload (direct)" }).click();
    expect(await waitForToast(page)).toMatch(/uploaded.*direct/i);

    // The direct POST stores the file with the server-side defaults
    // (`data.bin` / `application/octet-stream`) because the route doesn't
    // accept name/mimetype query params and the server's `getFile` does
    // not parse multipart Content-Disposition. So we only assert that the
    // block flipped to "attached" — the preview-rendering check lives on
    // the challenge-flow test below where the metadata round-trips.
    await expect(block.locator(".badge", { hasText: "attached" })).toBeVisible();
  });

  test("uploads via the challenge flow and renders the preview image", async ({ page }) => {
    const block = blockWithLabel(page, "Main image");
    await block.locator('input[type="file"]').setInputFiles({
      name: "challenge.png",
      mimeType: "image/png",
      buffer: TINY_PNG
    });
    await block.locator("button", { hasText: "Upload (challenge)" }).click();
    // The toast carries one of: "uploaded via signed URL", "instant link",
    // or a "fell back to direct POST" message depending on what the binary
    // service returns. Match the umbrella keywords so the spec is robust
    // against backend-store swaps.
    expect(await waitForToast(page)).toMatch(
      /(uploaded|signed url|instant link|direct post|already known)/i
    );
    await expect(block.locator(".badge", { hasText: "attached" })).toBeVisible();

    // Challenge uploads ship name/mimetype in the JSON body, so the stored
    // BinaryFileInfo carries `image/png` and the panel renders an <img>
    // pointing at the post's own attribute stream URL.
    const img = block.locator(".binary-preview img");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", /\/posts\/.+\/mainImage/);
  });

  test("sets width/height metadata and the dimensions show in the panel", async ({ page }) => {
    // Pre-arm the prompt sequence: the UI calls prompt() twice, once each
    // for width and height. autoAcceptDialogs in the parent test already
    // installed a confirm-handler; install the prompt sequence here.
    page.removeAllListeners("dialog");
    let i = 0;
    const promptValues = ["640", "480"];
    page.on("dialog", async dialog => {
      if (dialog.type() === "prompt") {
        await dialog.accept(promptValues[i++] ?? "");
      } else {
        await dialog.accept();
      }
    });

    const block = blockWithLabel(page, "Main image");
    await block.locator('input[type="file"]').setInputFiles({
      name: "withmeta.png",
      mimeType: "image/png",
      buffer: TINY_PNG
    });
    await block.locator("button", { hasText: "Upload (direct)" }).click();
    await waitForToast(page);

    await block.locator("button", { hasText: "Set width/height" }).click();
    expect(await waitForToast(page)).toMatch(/metadata.*640.*480/i);
    await expect(block.locator(".binary-info")).toContainText("640");
    await expect(block.locator(".binary-info")).toContainText("480");
  });

  test("delete clears the attached binary", async ({ page }) => {
    const block = blockWithLabel(page, "Main image");
    await block.locator('input[type="file"]').setInputFiles({
      name: "todelete.png",
      mimeType: "image/png",
      buffer: TINY_PNG
    });
    await block.locator("button", { hasText: "Upload (direct)" }).click();
    await waitForToast(page);
    await expect(block.locator(".badge", { hasText: "attached" })).toBeVisible();

    await block.locator("button", { hasText: "Delete" }).click();
    expect(await waitForToast(page)).toMatch(/deleted/i);
    await expect(block.locator(".badge", { hasText: "empty" })).toBeVisible();
    await expect(block.locator(".binary-empty")).toBeVisible();
  });
});

test.describe("Posts.images (Binaries collection)", () => {
  let slug: string;

  test.beforeEach(async ({ page }) => {
    await autoAcceptDialogs(page);
    await page.goto("/admin/");
    await gotoTab(page, "Posts");
    slug = fixtureSlug("post-binaries");
    await seedPost(page, slug, "Binaries Collection E2E");
  });

  test.afterEach(async ({ page }) => {
    await deletePost(page, slug);
  });

  test("appends multiple items, sets per-item metadata, and deletes one", async ({ page }) => {
    const block = blockWithLabel(page, "Additional images");
    const fileInput = block.locator('input[type="file"]');

    // Push two images with distinct payloads so the dedup check inside
    // BinariesImpl.attach lets both through (server keys by content hash).
    await fileInput.setInputFiles({
      name: "img-a.png",
      mimeType: "image/png",
      buffer: TINY_PNG
    });
    await block.locator("button", { hasText: "Add (direct)" }).click();
    await waitForToast(page);

    // Make a second-payload variant so the hash differs. Concatenate a one-
    // byte tag so the bytes differ from TINY_PNG; the server hashes raw
    // bytes, not a decoded image, so any difference is enough.
    const tagged = Buffer.concat([TINY_PNG, Buffer.from([0])]);
    await fileInput.setInputFiles({
      name: "img-b.png",
      mimeType: "image/png",
      buffer: tagged
    });
    await block.locator("button", { hasText: "Add (direct)" }).click();
    await waitForToast(page);

    // Badge shows "N items" (singular when len === 1, otherwise plural).
    await expect(block.locator(".badge")).toHaveText(/2 items/);
    const rows = block.locator(".binaries-list tbody tr");
    await expect(rows).toHaveCount(2);
    // (Direct uploads don't preserve mimetype, so the row's <img> doesn't
    // render — the per-row preview is exercised via the challenge-flow
    // test below where the BinaryFileInfo carries `image/png`.)

    // Set width/height for the first item via the per-row "Meta" button.
    page.removeAllListeners("dialog");
    let promptIdx = 0;
    const widths = ["320", "240"];
    page.on("dialog", async dialog => {
      if (dialog.type() === "prompt") {
        await dialog.accept(widths[promptIdx++] ?? "");
      } else {
        await dialog.accept();
      }
    });
    await rows.first().locator("button", { hasText: "Meta" }).click();
    await waitForToast(page);
    await expect(rows.first()).toContainText("320");
    await expect(rows.first()).toContainText("240");

    // Delete the second row; the collection shrinks back to 1 and the
    // remaining row is the first one we uploaded.
    await rows.nth(1).locator("button", { hasText: "Delete" }).click();
    await waitForToast(page);
    await expect(block.locator(".badge")).toHaveText(/1 item/);
    await expect(block.locator(".binaries-list tbody tr")).toHaveCount(1);
  });

  test("uploads via the challenge flow into the collection", async ({ page }) => {
    const block = blockWithLabel(page, "Additional images");

    await block.locator('input[type="file"]').setInputFiles({
      name: "via-challenge.png",
      mimeType: "image/png",
      buffer: TINY_PNG
    });
    await block.locator("button", { hasText: "Add (challenge)" }).click();
    expect(await waitForToast(page)).toMatch(
      /(pushed|signed url|instant link|direct post|already known)/i
    );
    await expect(block.locator(".badge")).toHaveText(/1 item/);
  });
});
