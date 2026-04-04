import { test, expect } from "@playwright/test";

/**
 * Navigation smoke tests — verify every page loads and the sidebar works.
 * Uses browser-mock mode so no Electron or LLM required.
 */

// Seed localStorage so ConfigGuard doesn't redirect to onboarding
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("claude-deck-config", JSON.stringify({
      name: "Test User", email: "test@example.com",
    }));
  });
});

const PAGES = [
  { path: "#/", label: "Agents" },
  { path: "#/notifications", label: "Inbox" },
  { path: "#/projects", label: "Projects" },
  { path: "#/schedule", label: "Schedule" },
  { path: "#/reflect", label: "Reflect" },
  { path: "#/insights", label: "Insights" },
  { path: "#/memories", label: "Memories" },
  { path: "#/context", label: "Context" },
  { path: "#/usage", label: "Usage" },
  { path: "#/settings", label: "Settings" },
];

test.describe("Sidebar navigation", () => {
  test("all nav items are visible and clickable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Sidebar should be visible
    const sidebar = page.locator("nav");
    await expect(sidebar).toBeVisible();

    // Each nav item should be clickable
    for (const { label } of PAGES) {
      const navButton = sidebar.getByText(label, { exact: true });
      await expect(navButton).toBeVisible();
      await navButton.click();
      // Page should navigate without error
      await page.waitForTimeout(200);
    }
  });

  test("sidebar collapse and expand works", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find and click the collapse button
    const collapseBtn = page.getByLabel("Collapse sidebar");
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await page.waitForTimeout(300);

    // Nav labels should be hidden when collapsed
    const agentsText = page.locator("nav").getByText("Agents", { exact: true });
    await expect(agentsText).not.toBeVisible();

    // Expand button should be visible and clickable
    const expandBtn = page.getByLabel("Expand sidebar");
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await page.waitForTimeout(300);

    // Labels should be visible again
    await expect(page.locator("nav").getByText("Agents", { exact: true })).toBeVisible();
  });
});

test.describe("Page loading", () => {
  for (const { path, label } of PAGES) {
    test(`${label} page loads without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(`/${path}`);
      await page.waitForLoadState("networkidle");

      // No console errors
      expect(errors).toHaveLength(0);

      // Page content area should exist (not blank)
      const content = page.locator("main, [style*='flex: 1'], [style*='flex:1']").first();
      await expect(content).toBeVisible();
    });
  }
});
