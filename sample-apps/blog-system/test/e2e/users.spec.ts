import { test, expect, type Request } from "@playwright/test";
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

  test("search filters the visible rows", async ({ page }) => {
    const alpha = fixtureUsername("searchalpha");
    const beta = fixtureUsername("searchbeta");
    for (const username of [alpha, beta]) {
      await page.locator(".toolbar button.btn-primary", { hasText: "+ New User" }).click();
      await formField(page, "Username").fill(username);
      await formField(page, "Email").fill(`${username}@example.com`);
      await formField(page, "Name").fill("Search User");
      await formField(page, "Password").fill("Test-Password-1");
      await page.locator(".modal-actions .btn-primary").click();
      expect(await waitForToast(page)).toMatch(/created/i);
    }
    const search = page.locator(".toolbar input[placeholder='Search users...']");
    // Wait for the filtered list to come back: asserting earlier would see the unfiltered rows
    const searchFor = async (text: string) => {
      const response = page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith("/users"));
      await search.fill(text);
      expect((await response).status()).toBe(200);
    };

    // Free text is turned into a LIKE query: only the matching user remains
    await searchFor(alpha);
    await expect(rowByKey(page, alpha)).toHaveCount(1);
    await expect(rowByKey(page, beta)).toHaveCount(0);

    // Characters that would break a WebdaQL literal must not cause a 400
    await searchFor(`'${beta})`);
    await expect(rowByKey(page, beta)).toHaveCount(1);
    await expect(rowByKey(page, alpha)).toHaveCount(0);
    await expect(page.locator(".toast.toast-error")).toHaveCount(0);

    // Typing is debounced: one query for the whole word, not one per keystroke
    await search.fill("");
    await expect(rowByKey(page, alpha)).toHaveCount(1);
    let searches = 0;
    const countSearch = (r: Request) => {
      if (r.method() === "PUT" && r.url().endsWith("/users")) searches++;
    };
    page.on("request", countSearch);
    const typed = page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith("/users"));
    await search.pressSequentially(beta, { delay: 30 });
    expect((await typed).status()).toBe(200);
    // Give a late keystroke-triggered request the chance to show up before counting
    await page.waitForTimeout(500);
    page.off("request", countSearch);
    expect(searches).toBe(1);
    await expect(rowByKey(page, beta)).toHaveCount(1);
    await expect(rowByKey(page, alpha)).toHaveCount(0);

    // Clearing the box lists everything again
    await searchFor("");
    await expect(rowByKey(page, alpha)).toHaveCount(1);
    await expect(rowByKey(page, beta)).toHaveCount(1);

    for (const username of [alpha, beta]) {
      await rowByKey(page, username).locator("button", { hasText: "Delete" }).click();
      expect(await waitForToast(page)).toMatch(/deleted/i);
    }
  });
});
