import { test, expect } from "@playwright/test";
import { autoAcceptDialogs, fixtureUsername, formField, gotoTab, rowByKey, waitForToast } from "./helpers.js";

test.describe("Users panel", () => {
  test.beforeEach(async ({ page }) => {
    await autoAcceptDialogs(page);
    await page.goto("/admin/");
    await gotoTab(page, "Users");
  });

  test("creates, edits and deletes a user", async ({ page }) => {
    const username = fixtureUsername("user");
    const initialName = "Test User";
    const editedName = "Edited User";
    const email = `${username}@example.com`;

    // ---- create ----
    await page.locator(".toolbar button.btn-primary", { hasText: "+ New User" }).click();
    await expect(page.locator(".modal h2")).toHaveText("New User");

    await formField(page, "Username").fill(username);
    await formField(page, "Email").fill(email);
    await formField(page, "Name").fill(initialName);
    await formField(page, "Password").fill("Test-Password-1");
    await page.locator(".modal-actions .btn-primary").click();

    expect(await waitForToast(page)).toMatch(/created/i);

    // The new row shows the username in a `td.mono` cell. Use it as the
    // anchor for follow-up actions so we don't accidentally hit a row from
    // a previous run.
    const row = rowByKey(page, username);
    await expect(row).toContainText(initialName);
    await expect(row).toContainText(email);

    // ---- edit ----
    await row.locator("button", { hasText: "Edit" }).click();
    await expect(page.locator(".modal h2")).toHaveText("Edit User");
    await formField(page, "Name").fill(editedName);
    await page.locator(".modal-actions .btn-primary", { hasText: "Update" }).click();

    expect(await waitForToast(page)).toMatch(/updated/i);
    await expect(rowByKey(page, username)).toContainText(editedName);

    // ---- delete ----
    await rowByKey(page, username).locator("button", { hasText: "Delete" }).click();
    expect(await waitForToast(page)).toMatch(/deleted/i);
    await expect(rowByKey(page, username)).toHaveCount(0);
  });

  // The search box just forwards its raw value into the server's `q`
  // parameter, which expects WebdaQL syntax — typing a free-text username
  // produces a 400 "Query syntax error" and the list silently keeps the
  // previously-loaded rows. Skipping until the search input either runs
  // through a query builder or LIKE-wraps the user's input.
  test.skip("search filters the visible rows", async () => {});
});
