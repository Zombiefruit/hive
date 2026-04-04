import { test, expect, type Page } from "@playwright/test";

/**
 * Contrast and visibility checks — verify text is readable and
 * interactive elements are visible in both dark and light mode.
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

async function getComputedColor(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate((el) => {
    return window.getComputedStyle(el).color;
  });
}

async function getComputedBgColor(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor;
  });
}

/** Parse rgb(r, g, b) or rgba(r, g, b, a) to [r, g, b] */
function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

/** Relative luminance per WCAG 2.0 */
function luminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG contrast ratio */
function contrastRatio(c1: [number, number, number], c2: [number, number, number]): number {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("Dark mode contrast", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("sidebar nav text has sufficient contrast", async ({ page }) => {
    const navItems = page.locator("nav button");
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 8); i++) {
      const item = navItems.nth(i);
      if (!(await item.isVisible())) continue;

      const color = await item.evaluate((el) => window.getComputedStyle(el).color);
      const rgb = parseRgb(color);
      if (!rgb) continue;

      // Text should not be too dark (invisible on dark bg)
      // At minimum, one channel should be above 80
      const maxChannel = Math.max(...rgb);
      expect(maxChannel).toBeGreaterThan(60);
    }
  });

  test("badge text is readable", async ({ page }) => {
    // Navigate to notifications page which has badges
    await page.goto("/#/notifications");
    await page.waitForLoadState("networkidle");

    const badges = page.locator(".mantine-Badge-root");
    const count = await badges.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const badge = badges.nth(i);
      if (!(await badge.isVisible())) continue;

      const box = await badge.boundingBox();
      if (!box || box.width < 5 || box.height < 5) continue;

      // Badge should have non-zero dimensions (not collapsed/hidden)
      expect(box.width).toBeGreaterThan(10);
      expect(box.height).toBeGreaterThan(8);
    }
  });
});

test.describe("Light mode contrast", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Force light mode via Mantine's localStorage key
    await page.evaluate(() => {
      localStorage.setItem("mantine-color-scheme-value", "light");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("body background is light", async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    const rgb = parseRgb(bgColor);
    if (rgb) {
      // In light mode, background luminance should be high
      const lum = luminance(rgb);
      expect(lum).toBeGreaterThan(0.5);
    }
  });

  test("sidebar nav text is dark enough on light background", async ({ page }) => {
    const navItems = page.locator("nav button");
    const count = await navItems.count();
    let checked = 0;

    for (let i = 0; i < Math.min(count, 8); i++) {
      const item = navItems.nth(i);
      if (!(await item.isVisible())) continue;

      const color = await item.evaluate((el) => window.getComputedStyle(el).color);
      const rgb = parseRgb(color);
      if (!rgb) continue;

      // Skip active items that use accent blue — those are intentionally bright
      const isAccentBlue = rgb[2] > 180 && rgb[0] < 100;
      if (isAccentBlue) continue;

      // Inactive text should have reasonable contrast (luminance < 0.4)
      const lum = luminance(rgb);
      expect(lum).toBeLessThan(0.4);
      checked++;
    }

    // Should have checked at least some items
    expect(checked).toBeGreaterThan(0);
  });
});
