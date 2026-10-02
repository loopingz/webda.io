import { test, expect } from "@playwright/test";
import { autoAcceptDialogs, fixtureSlug, formField, gotoTab, rowByKey, waitForToast } from "./helpers.js";

test.describe("Audit log", () => {
  test.beforeEach(async ({ page }) => {
    await autoAcceptDialogs(page);
    await page.goto("/admin/");
  });

  test("shows an object's history and the global log", async ({ page }) => {
    const slug = fixtureSlug("audited");
    await gotoTab(page, "Tags");
    await page.locator(".toolbar button.btn-primary", { hasText: "+ New Tag" }).click();
    await formField(page, "Name").fill("Audited Tag");
    await formField(page, "Slug").fill(slug);
    await page.locator(".modal-actions .btn-primary").click();
    expect(await waitForToast(page)).toMatch(/created/i);
    await rowByKey(page, slug).locator("button", { hasText: "Edit" }).click();
    await formField(page, "Name").fill("Audited Tag 2");
    await page.locator(".modal-actions .btn-primary", { hasText: "Update" }).click();
    expect(await waitForToast(page)).toMatch(/updated/i);

    // ---- per-object history ----
    await rowByKey(page, slug).locator("button", { hasText: "History" }).click();
    const modal = page.locator(".modal");
    await expect(modal.locator("h2")).toHaveText("History");
    await expect(modal.locator("tbody tr", { hasText: "Tag.Create" })).toHaveCount(1);
    await expect(modal.locator("tbody tr", { hasText: "Tag.Patch" })).toHaveCount(1);
    await expect(modal.locator("tbody tr", { hasText: "Tag.Patch" })).toContainText("success");
    await modal.locator("button", { hasText: "Close" }).click();
    await expect(modal).toHaveCount(0);

    // ---- global log ----
    await gotoTab(page, "Audit");
    await page.locator(".toolbar input[placeholder='Search audit...']").fill(slug);
    await expect(page.locator("tbody tr", { hasText: "Tag.Patch" })).toHaveCount(1);
    await expect(page.locator("tbody tr", { hasText: "Tag.Patch" })).toContainText(slug);

    // ---- cleanup ----
    await gotoTab(page, "Tags");
    await rowByKey(page, slug).locator("button", { hasText: "Delete" }).click();
    expect(await waitForToast(page)).toMatch(/deleted/i);
  });
});
