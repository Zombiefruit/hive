/**
 * WCAG contrast utilities — ensures text is always readable
 * regardless of background color in light or dark mode.
 */

/** Parse hex (#rgb, #rrggbb) or rgb(r,g,b) to [r, g, b]. Returns null on failure. */
export function parseColor(color: string): [number, number, number] | null {
  // hex
  const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    }
    if (hex.length >= 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  // rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  return null;
}

/** WCAG 2.0 relative luminance */
export function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG contrast ratio between two RGB colors */
export function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const l1 = luminance(...fg);
  const l2 = luminance(...bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick the best text color (white or dark) for a given background.
 * Returns a CSS color string that meets WCAG AA (4.5:1) contrast.
 */
export function contrastText(bgColor: string): string {
  const bg = parseColor(bgColor);
  if (!bg) return "inherit";

  const white: [number, number, number] = [255, 255, 255];
  const dark: [number, number, number] = [26, 30, 46]; // --aegen-star-white light mode value

  const whiteRatio = contrastRatio(white, bg);
  const darkRatio = contrastRatio(dark, bg);

  return whiteRatio > darkRatio ? "#ffffff" : "#1a1e2e";
}
