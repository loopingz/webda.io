import { test, expect } from "@playwright/test";
import { autoAcceptDialogs, fixtureSlug, formField, gotoTab, rowByKey, waitForToast } from "./helpers.js";

test.describe("Posts panel", () => {
  test.beforeEach(async ({ page }) => {
    await autoAcceptDialogs(page);
    await page.goto("/admin/");
    await gotoTab(page, "Posts");
  });

  test("creates, edits, publishes and deletes a post", async ({ page }) => {
    const slug = fixtureSlug("post");
    const title = "Test post created by playwright";
    const editedTitle = "Test post edited by playwright";
    const content = "This is the body of a post created during e2e testing.";

    // ---- create ----
    await page.locator(".toolbar button.btn-primary", { hasText: "+ New Post" }).click();
    await expect(page.locator(".modal h2")).toHaveText("New Post");

    await formField(page, "Title").fill(title);
    await formField(page, "Slug").fill(slug);
    await formField(page, "Content").fill(content);
    await formField(page, "Excerpt").fill("e2e excerpt");
    await page.locator(".modal-actions .btn-primary", { hasText: "Create" }).click();
    expect(await waitForToast(page)).toMatch(/created/i);

    // The Posts panel re-opens the modal in Edit mode after create so the
    // user can attach binaries. Close it before checking the table row.
    await expect(page.locator(".modal h2")).toHaveText("Edit Post");
    await page.locator(".modal-actions .btn-ghost", { hasText: "Close" }).click();
    await expect(page.locator(".modal")).toHaveCount(0);

    const row = rowByKey(page, slug);
    await expect(row).toContainText(title);
    await expect(row.locator(".badge")).toHaveText("draft");

    // ---- edit (title + status) ----
    await row.locator("button", { hasText: "Edit" }).click();
    await expect(page.locator(".modal h2")).toHaveText("Edit Post");
    await formField(page, "Title").fill(editedTitle);
    await formField(page, "Status").selectOption("published");
    await page.locator(".modal-actions .btn-primary", { hasText: "Update" }).click();
    expect(await waitForToast(page)).toMatch(/updated/i);

    const updatedRow = rowByKey(page, slug);
    await expect(updatedRow).toContainText(editedTitle);
    await expect(updatedRow.locator(".badge")).toHaveText("published");

    // ---- delete ----
    await updatedRow.locator("button", { hasText: "Delete" }).click();
    expect(await waitForToast(page)).toMatch(/deleted/i);
    await expect(rowByKey(page, slug)).toHaveCount(0);
  });
});
