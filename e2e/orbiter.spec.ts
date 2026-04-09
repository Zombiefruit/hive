import { test, expect } from "@playwright/test";

/**
 * Orbiter tests — verify the AI orb, thought bubbles, and chat panel
 * behavior including open/close/pin state management.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("claude-deck-config", JSON.stringify({
      name: "Test User", email: "test@example.com",
    }));
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test.describe("Orb visibility and interaction", () => {
  test("orb is visible on page load", async ({ page }) => {
    // The orb canvas should be present in the fixed container
    const orbContainer = page.locator("div[style*='position: fixed'][style*='bottom']").last();
    await expect(orbContainer).toBeVisible();
  });

  test("clicking orb opens the floating panel", async ({ page }) => {
    // Click the orb area (bottom-right)
    const orb = page.locator("div[style*='cursor: pointer']").last();
    await orb.click();

    // Panel should appear with Chat and Thoughts tabs
    const chatTab = page.getByText("Chat", { exact: true });
    const thoughtsTab = page.getByText("Thoughts", { exact: true });
    await expect(chatTab).toBeVisible({ timeout: 3000 });
    await expect(thoughtsTab).toBeVisible({ timeout: 3000 });
  });

  test("clicking X closes panel back to orb state", async ({ page }) => {
    // Open panel
    const orb = page.locator("div[style*='cursor: pointer']").last();
    await orb.click();

    // Wait for panel to be visible
    const chatTab = page.getByText("Chat", { exact: true });
    await expect(chatTab).toBeVisible({ timeout: 3000 });

    // Click close button
    const closeBtn = page.locator("button[title='Close panel']");
    await closeBtn.click();

    // Panel should be gone
    await expect(chatTab).not.toBeVisible({ timeout: 3000 });
  });

  test("pin button pins panel as sidebar", async ({ page }) => {
    // Open panel
    const orb = page.locator("div[style*='cursor: pointer']").last();
    await orb.click();
    await page.getByText("Chat", { exact: true }).waitFor({ state: "visible", timeout: 3000 });

    // Click pin button
    const pinBtn = page.locator("button[title='Pin to sidebar']");
    await pinBtn.click();

    // Panel should now be in pinned mode (full-height sidebar)
    const pinnedPanel = page.locator("div[style*='position: fixed'][style*='top: 0'][style*='right: 0'][style*='bottom: 0']");
    await expect(pinnedPanel).toBeVisible({ timeout: 3000 });
  });

  test("X from pinned state closes entirely (one click)", async ({ page }) => {
    // Open panel
    const orb = page.locator("div[style*='cursor: pointer']").last();
    await orb.click();
    await page.getByText("Chat", { exact: true }).waitFor({ state: "visible", timeout: 3000 });

    // Pin it
    const pinBtn = page.locator("button[title='Pin to sidebar']");
    await pinBtn.click();
    await page.waitForTimeout(300);

    // Click close — should close entirely, not just unpin
    const closeBtn = page.locator("button[title='Close panel']");
    await closeBtn.click();

    // Chat tab should be fully gone — no floating panel either
    const chatTab = page.getByText("Chat", { exact: true });
    await expect(chatTab).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("Thought bubbles", () => {
  test("thought bubble appears within 10 seconds", async ({ page }) => {
    // The mock emits a thought at 500ms and then every 8s
    // Wait for a floating thought to appear
    const thoughtBubble = page.locator("p").filter({ hasText: /Monitoring|quiet|new came in|Quality|Keeping|Multiple|Nothing/ });
    await expect(thoughtBubble.first()).toBeVisible({ timeout: 12000 });
  });

  test("thoughts tab shows thought history", async ({ page }) => {
    // Open panel
    const orb = page.locator("div[style*='cursor: pointer']").last();
    await orb.click();
    await page.getByText("Chat", { exact: true }).waitFor({ state: "visible", timeout: 3000 });

    // Switch to Thoughts tab
    const thoughtsTab = page.getByText("Thoughts", { exact: true });
    await thoughtsTab.click();

    // Should show at least one thought from the mock initial load
    await page.waitForTimeout(1000);
    const thoughtItems = page.locator("p").filter({ hasText: /Keeping|smoothly|Sorting|active/ });
    const count = await thoughtItems.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Detail drawer tab contrast", () => {
  test("detail drawer tabs use CSS class approach (not inline styles)", async ({ page }) => {
    await page.goto("/#/notifications");
    await page.waitForLoadState("networkidle");

    // Verify the .detail-tabs class exists in the rendered CSS
    const hasDetailTabsStyle = await page.evaluate(() => {
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules;
          for (let j = 0; j < rules.length; j++) {
            if (rules[j].cssText?.includes(".detail-tabs")) return true;
          }
        } catch { /* cross-origin sheets */ }
      }
      return false;
    });
    expect(hasDetailTabsStyle).toBe(true);
  });
});

test.describe("Theme cycling", () => {
  test("theme button cycles through auto → light → dark", async ({ page }) => {
    // Find the theme toggle button (in sidebar bottom section)
    const themeBtn = page.locator("button[aria-label*='Theme']");
    await expect(themeBtn).toBeVisible();

    // Click once — should go from auto to light
    await themeBtn.click();
    await page.waitForTimeout(200);
    let label = await themeBtn.getAttribute("aria-label");
    expect(label).toContain("Light");

    // Click again — should go from light to dark
    await themeBtn.click();
    await page.waitForTimeout(200);
    label = await themeBtn.getAttribute("aria-label");
    expect(label).toContain("Dark");

    // Click again — should cycle back to auto
    await themeBtn.click();
    await page.waitForTimeout(200);
    label = await themeBtn.getAttribute("aria-label");
    expect(label).toContain("Auto");
  });
});
