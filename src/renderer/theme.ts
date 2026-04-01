import {
  createTheme,
  DEFAULT_THEME,
  mergeMantineTheme,
  virtualColor,
} from "@mantine/core";

/**
 * Claude Deck theme — adapted from Monte Carlo frontend.
 * Keeps the same color palette, spacing, and typography for visual consistency.
 */
const deckTheme = createTheme({
  cursorType: "pointer",

  spacing: {
    xxxs: "0.125rem",
    xxs: "0.25rem",
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.25rem",
    xl: "1.5rem",
  },

  fontFamily:
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji",
  fontFamilyMonospace:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",

  lineHeights: {
    xs: "1.4285714286",
    sm: "1.4285714286",
    md: "1.4285714286",
    lg: "1.4285714286",
    xl: "1.4285714286",
  },

  headings: {
    fontWeight: "500",
    sizes: {
      h1: { fontSize: "1.5rem", lineHeight: "1.333", fontWeight: "600" },
      h2: { fontSize: "1.25rem", lineHeight: "1.5", fontWeight: "600" },
      h3: { fontSize: "1rem", lineHeight: "1.375", fontWeight: "500" },
      h4: { fontSize: "0.875rem", lineHeight: "1.4286", fontWeight: "500" },
    },
  },

  black: "#273139",
  primaryShade: 5,
  autoContrast: true,
  luminanceThreshold: 0.2,

  colors: {
    red: [
      "#fee9e9", "#fcc8c8", "#faa7a7", "#f88282", "#f55150",
      "#dc2322", "#bb1d1d", "#971817", "#711211", "#5c0b0a",
    ],
    blue: [
      "#f3f9ff", "#d7ebfe", "#b0d6fc", "#78b9f9", "#469ef6",
      "#1576d8", "#0b5fb2", "#064381", "#032446", "#021c37",
    ],
    gray: [
      "#f5f8fb", "#e5ecf2", "#d7e1ea", "#d1dbe4", "#bdcbd6",
      "#a8b8c5", "#91a2b0", "#748492", "#515f6a", "#273139",
    ],
    violet: [
      "#f4f3ff", "#eee3fe", "#d6bfff", "#c39deb", "#ab7ae7",
      "#9455dd", "#783cb5", "#54278e", "#38215d", "#291648",
    ],
    dark: [
      "#c9d0d7", "#96a2ad", "#6c7a87", "#53606c", "#3a444d",
      "#2b333b", "#22292f", "#1b2126", "#14181c", "#0e1114",
    ],
    ok: virtualColor({ name: "ok", dark: "green", light: "green" }),
    warning: virtualColor({ name: "warning", dark: "yellow", light: "yellow" }),
    attention: virtualColor({ name: "attention", dark: "orange", light: "orange" }),
    error: virtualColor({ name: "error", dark: "red", light: "red" }),
    neutral: virtualColor({ name: "neutral", dark: "gray", light: "gray" }),
  },

  components: {
    Button: { defaultProps: { variant: "filled" } },
    Modal: { defaultProps: { centered: true } },
    Drawer: { defaultProps: { position: "right" } },
    ActionIcon: { defaultProps: { variant: "subtle" } },
    Text: { defaultProps: { size: "sm" } },
    Select: {
      defaultProps: { checkIconPosition: "right", allowDeselect: false },
      styles: {
        dropdown: {
          backgroundColor: "var(--mantine-color-body)",
          borderColor: "var(--mantine-color-default-border)",
        },
        option: {
          borderRadius: 4,
        },
      },
    },
    Radio: {
      styles: {
        radio: {
          borderColor: "var(--mantine-color-default-border)",
        },
      },
    },
    Switch: {
      styles: {
        track: {
          borderColor: "var(--mantine-color-default-border)",
        },
      },
    },
    Tabs: {
      styles: {
        tab: {
          "&[dataActive]": {
            borderColor: "var(--mantine-color-blue-filled)",
          },
        },
      },
    },
    Stepper: {
      styles: {
        stepIcon: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
    },
    Tooltip: { defaultProps: { events: { hover: true, focus: true, touch: false } } },
  },
});

export const theme = mergeMantineTheme(DEFAULT_THEME, deckTheme);
