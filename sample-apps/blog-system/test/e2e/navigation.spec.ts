import { test, expect } from "@playwright/test";
import { gotoTab } from "./helpers.js";

test.describe("admin shell", () => {
  test("renders header and four-tab nav", async ({ page }) => {
    await page.goto("/admin/");
    await expect(page.locator(".header h1")).toHaveText(/Blog\s+Admin/);
    const tabs = page.locator(".nav button");
    await expect(tabs).toHaveCount(4);
    await expect(tabs).toHaveText(["Posts", "Users", "Tags", "Comments"]);
  });

  test("defaults to the Posts tab", async ({ page }) => {
    await page.goto("/admin/");
    await expect(page.locator(".nav button.active")).toHaveText("Posts");
    await expect(page.locator(".toolbar input")).toHaveAttribute("placeholder", /search posts/i);
  });

  test("each tab swaps the panel and the active marker", async ({ page }) => {
    await page.goto("/admin/");

    for (const tab of ["Users", "Tags", "Comments", "Posts"] as const) {
      await gotoTab(page, tab);
      await expect(page.locator(".toolbar input")).toHaveAttribute(
        "placeholder",
        new RegExp(`search ${tab.toLowerCase()}`, "i")
      );
    }
  });
});
