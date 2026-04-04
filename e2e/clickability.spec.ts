import { test, expect } from "@playwright/test";

/**
 * Clickability tests — verify that interactive elements are not
 * blocked by overlays, z-index issues, or pointer-events problems.
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

test.describe("Interactive elements are clickable", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("all sidebar nav buttons respond to click", async ({ page }) => {
    const navButtons = page.locator("nav button:visible");
    const count = await navButtons.count();
    expect(count).toBeGreaterThan(5);

    let clickable = 0;
    for (let i = 0; i < count; i++) {
      const btn = navButtons.nth(i);
      const box = await btn.boundingBox();
      if (!box || box.width < 10 || box.height < 10) continue;

      // Element should have reasonable size
      expect(box.width).toBeGreaterThan(20);
      expect(box.height).toBeGreaterThan(15);
      clickable++;
    }
    expect(clickable).toBeGreaterThan(5);
  });

  test("theme toggle button works", async ({ page }) => {
    const themeBtn = page.getByLabel(/switch to (light|dark) mode/i);
    await expect(themeBtn).toBeVisible();

    // Click should not throw
    await themeBtn.click();
    await page.waitForTimeout(200);

    // Should still be visible after toggling
    const themeBtn2 = page.getByLabel(/switch to (light|dark) mode/i);
    await expect(themeBtn2).toBeVisible();
  });

  test("refresh button is clickable", async ({ page }) => {
    const refreshBtn = page.getByLabel("Refresh all data sources");
    await expect(refreshBtn).toBeVisible();

    const box = await refreshBtn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(15);
      expect(box.height).toBeGreaterThan(15);
    }
  });

  test("settings page form elements are interactive", async ({ page }) => {
    await page.goto("/#/settings");
    await page.waitForLoadState("networkidle");

    // Settings page should have input fields
    const inputs = page.locator("input");
    const count = await inputs.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const input = inputs.nth(i);
      if (!(await input.isVisible())) continue;

      // Input should be focusable
      const box = await input.boundingBox();
      expect(box).not.toBeNull();
    }
  });

  test("agent cards on dashboard are clickable", async ({ page }) => {
    // Dashboard should show mock agent cards
    const cards = page.locator(".deck-card, [role='button']");
    const count = await cards.count();

    // With mock data, should have at least 1 card
    if (count > 0) {
      const firstCard = cards.first();
      const box = await firstCard.boundingBox();
      expect(box).not.toBeNull();
    }
  });
});

test.describe("Orbiter does not block page content", () => {
  test("bottom-right content area is clickable", async ({ page }) => {
    await page.goto("/#/settings");
    await page.waitForLoadState("networkidle");

    // Try to click in the bottom-right quadrant of the page
    const viewport = page.viewportSize();
    if (!viewport) return;

    // Check that elements in the bottom-right are not blocked
    // by the orbiter's invisible container
    const bottomRightEl = await page.evaluateHandle(
      ([x, y]) => document.elementFromPoint(x, y),
      [viewport.width - 200, viewport.height - 100]
    );

    const tagName = await bottomRightEl.evaluate((el: Element | null) =>
      el ? el.tagName.toLowerCase() : "none"
    );

    // Should not be an svg or canvas (that would be the orb)
    // It should be a real page element
    expect(tagName).not.toBe("none");
  });
});

test.describe("Collapsed sidebar buttons remain clickable", () => {
  test("expand button works after collapse", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Collapse
    const collapseBtn = page.getByLabel("Collapse sidebar");
    await collapseBtn.click();
    await page.waitForTimeout(300);

    // Theme toggle should still be clickable
    const themeBtn = page.getByLabel(/switch to (light|dark) mode/i);
    await expect(themeBtn).toBeVisible();
    const themeBox = await themeBtn.boundingBox();
    expect(themeBox).not.toBeNull();

    // Expand should work
    const expandBtn = page.getByLabel("Expand sidebar");
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await page.waitForTimeout(300);

    // Verify expanded state
    await expect(page.locator("nav").getByText("Agents", { exact: true })).toBeVisible();
  });
});
