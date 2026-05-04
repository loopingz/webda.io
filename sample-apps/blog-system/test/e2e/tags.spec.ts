import { test, expect } from "@playwright/test";
import { autoAcceptDialogs, fixtureSlug, formField, gotoTab, rowByKey, waitForToast } from "./helpers.js";

test.describe("Tags panel", () => {
  test.beforeEach(async ({ page }) => {
    await autoAcceptDialogs(page);
    await page.goto("/admin/");
    await gotoTab(page, "Tags");
  });

  test("creates, edits and deletes a tag", async ({ page }) => {
    const slug = fixtureSlug("tag");
    const name = "Test Tag";
    const editedName = "Edited Tag";

    // ---- create ----
    await page.locator(".toolbar button.btn-primary", { hasText: "+ New Tag" }).click();
    await expect(page.locator(".modal h2")).toHaveText("New Tag");

    await formField(page, "Name").fill(name);
    await formField(page, "Slug").fill(slug);
    await formField(page, "Description").fill("seeded by playwright");
    await page.locator(".modal-actions .btn-primary").click();
    expect(await waitForToast(page)).toMatch(/created/i);

    const row = rowByKey(page, slug);
    await expect(row).toContainText(name);

    // ---- edit ----
    await row.locator("button", { hasText: "Edit" }).click();
    await expect(page.locator(".modal h2")).toHaveText("Edit Tag");
    // The slug field is intentionally disabled while editing to keep PKs stable.
    await expect(formField(page, "Slug")).toBeDisabled();
    await formField(page, "Name").fill(editedName);
    await page.locator(".modal-actions .btn-primary", { hasText: "Update" }).click();
    expect(await waitForToast(page)).toMatch(/updated/i);
    await expect(rowByKey(page, slug)).toContainText(editedName);

    // ---- delete ----
    await rowByKey(page, slug).locator("button", { hasText: "Delete" }).click();
    expect(await waitForToast(page)).toMatch(/deleted/i);
    await expect(rowByKey(page, slug)).toHaveCount(0);
  });
});
