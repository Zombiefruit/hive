import {
  createTheme,
  DEFAULT_THEME,
  mergeMantineTheme,
  virtualColor,
} from "@mantine/core";

/**
 * Aegen Design System — Mantine Theme Override
 * Dark-only cosmic design language with glassmorphism surfaces.
 */
const aeGenTheme = createTheme({
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
    "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  fontFamilyMonospace:
    "'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace",

  lineHeights: {
    xs: "1.4285714286",
    sm: "1.4285714286",
    md: "1.4285714286",
    lg: "1.4285714286",
    xl: "1.4285714286",
  },

  headings: {
    fontWeight: "500",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    sizes: {
      h1: { fontSize: "1.5rem", lineHeight: "1.333", fontWeight: "600" },
      h2: { fontSize: "1.25rem", lineHeight: "1.5", fontWeight: "600" },
      h3: { fontSize: "1rem", lineHeight: "1.375", fontWeight: "500" },
      h4: { fontSize: "0.875rem", lineHeight: "1.4286", fontWeight: "500" },
    },
  },

  black: "#d3d8e4", // Star White — primary text in dark
  primaryShade: 5,
  autoContrast: true,
  luminanceThreshold: 0.2,

  colors: {
    // Cosmic Blue shades
    blue: [
      "#e6efff", "#c4d7ff", "#99bcff", "#6e9fff", "#4a7dff",
      "#3a6ae6", "#2d55cc", "#1f3da3", "#13287a", "#0a1752",
    ],
    // Stellar Purple shades
    violet: [
      "#f3e8fe", "#e2c6fd", "#c89dfb", "#ae74f9", "#a855f7",
      "#8e3de0", "#7428c9", "#5a1ea3", "#40147d", "#2a0c57",
    ],
    // Plasma Cyan shades
    cyan: [
      "#e4f6fe", "#bfe9fd", "#8dd7fb", "#5bc5f9", "#38bdf8",
      "#2da5de", "#228cc4", "#17699b", "#0d4872", "#063049",
    ],
    // Alert Warm shades
    red: [
      "#ffe8e0", "#ffc9b8", "#ffa48a", "#ff805c", "#ff6b3d",
      "#e65a2f", "#cc4921", "#a33718", "#7a280f", "#521a08",
    ],
    // Alert Gold shades
    yellow: [
      "#fff3dc", "#ffe4b0", "#ffd180", "#ffbe50", "#ffaa33",
      "#e69929", "#cc871f", "#a36b18", "#7a5011", "#52360a",
    ],
    // Success green shades
    green: [
      "#e0f7eb", "#b3ecd0", "#80ddb3", "#4dce96", "#26bf7e",
      "#1fa86c", "#18905b", "#117249", "#0a5437", "#053625",
    ],
    // Deep Space / UI gray shades
    gray: [
      "#d3d8e4", "#b4b9c7", "#969cac", "#74788a", "#5a5f6f",
      "#444955", "#2e3240", "#1d2130", "#101520", "#050810",
    ],
    // Dark (Mantine dark scheme tokens)
    dark: [
      "#d3d8e4", "#b4b9c7", "#969cac", "#74788a", "#5a5f6f",
      "#444955", "#2e3240", "#1d2130", "#101520", "#050810",
    ],
    ok: virtualColor({ name: "ok", dark: "green", light: "green" }),
    warning: virtualColor({ name: "warning", dark: "yellow", light: "yellow" }),
    attention: virtualColor({
      name: "attention",
      dark: "yellow",
      light: "yellow",
    }),
    error: virtualColor({ name: "error", dark: "red", light: "red" }),
    neutral: virtualColor({ name: "neutral", dark: "gray", light: "gray" }),
  },

  components: {
    // Paper — glass surface
    Paper: {
      defaultProps: { radius: "md" },
      styles: () => ({
        root: {
          background: "rgba(16, 21, 32, 0.72)",
          backdropFilter: "blur(20px) saturate(1.3)",
          WebkitBackdropFilter: "blur(20px) saturate(1.3)",
          border: "1px solid rgba(68, 73, 85, 0.2)",
          boxShadow:
            "0 0 12px rgba(74, 125, 255, 0.1), inset 0 0 12px rgba(74, 125, 255, 0.03)",
        },
      }),
    },

    // Card — glass elevated surface
    Card: {
      defaultProps: { radius: "md", padding: "lg" },
      styles: () => ({
        root: {
          background:
            "linear-gradient(135deg, rgba(16, 21, 32, 0.9), rgba(26, 22, 37, 0.82))",
          backdropFilter: "blur(20px) saturate(1.3)",
          WebkitBackdropFilter: "blur(20px) saturate(1.3)",
          border: "1px solid rgba(68, 73, 85, 0.2)",
          borderRadius: 14,
          boxShadow:
            "0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(74, 125, 255, 0.05)",
        },
      }),
    },

    // Badge — Aegen styled
    Badge: {
      styles: () => ({
        root: {
          borderRadius: 20,
          fontFamily:
            "'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace",
          fontSize: "0.6rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase" as const,
        },
      }),
    },

    // Button — glass buttons with glow
    Button: {
      defaultProps: { variant: "filled", radius: "md" },
      styles: () => ({
        root: {
          borderRadius: 10,
          transition: "all 0.2s cubic-bezier(0.23, 1, 0.32, 1)",
          "&:hover": {
            transform: "scale(1.03)",
          },
        },
      }),
    },

    // Accordion — glass panels
    Accordion: {
      styles: () => ({
        item: {
          background: "rgba(16, 21, 32, 0.72)",
          backdropFilter: "blur(16px) saturate(1.2)",
          border: "1px solid rgba(68, 73, 85, 0.2)",
          borderRadius: 14,
          marginBottom: 8,
        },
        control: {
          color: "#d3d8e4",
          "&:hover": {
            background: "rgba(74, 125, 255, 0.05)",
          },
        },
        content: {
          color: "#b4b9c7",
        },
      }),
    },

    // TextInput — deep space input
    TextInput: {
      styles: () => ({
        input: {
          background: "rgba(16, 21, 32, 0.7)",
          border: "1px solid rgba(68, 73, 85, 0.3)",
          color: "#d3d8e4",
          borderRadius: 10,
          "&::placeholder": {
            color: "#74788a",
          },
          "&:focus": {
            borderColor: "rgba(74, 125, 255, 0.4)",
            boxShadow: "0 0 0 2px rgba(74, 125, 255, 0.15)",
          },
        },
        label: {
          color: "#d3d8e4",
        },
        description: {
          color: "#74788a",
        },
      }),
    },

    // Textarea — same as TextInput
    Textarea: {
      styles: () => ({
        input: {
          background: "rgba(16, 21, 32, 0.7)",
          border: "1px solid rgba(68, 73, 85, 0.3)",
          color: "#d3d8e4",
          borderRadius: 10,
          "&::placeholder": {
            color: "#74788a",
          },
          "&:focus": {
            borderColor: "rgba(74, 125, 255, 0.4)",
            boxShadow: "0 0 0 2px rgba(74, 125, 255, 0.15)",
          },
        },
      }),
    },

    // Select — glass dropdown
    Select: {
      defaultProps: { checkIconPosition: "right", allowDeselect: false },
      styles: () => ({
        input: {
          background: "rgba(16, 21, 32, 0.7)",
          border: "1px solid rgba(68, 73, 85, 0.3)",
          color: "#d3d8e4",
          borderRadius: 10,
          "&:focus": {
            borderColor: "rgba(74, 125, 255, 0.4)",
          },
        },
        dropdown: {
          background: "rgba(26, 22, 37, 0.95)",
          backdropFilter: "blur(20px) saturate(1.3)",
          border: "1px solid rgba(68, 73, 85, 0.3)",
          borderRadius: 12,
        },
        option: {
          borderRadius: 8,
          color: "#d3d8e4",
          "&[dataChecked]": {
            background: "rgba(74, 125, 255, 0.15)",
          },
          "&:hover": {
            background: "rgba(74, 125, 255, 0.1)",
          },
        },
      }),
    },

    // Radio — Aegen styled
    Radio: {
      styles: () => ({
        radio: {
          borderColor: "rgba(68, 73, 85, 0.4)",
          backgroundColor: "rgba(16, 21, 32, 0.7)",
        },
        label: {
          color: "#d3d8e4",
        },
      }),
    },

    // Switch — Aegen styled
    Switch: {
      styles: () => ({
        track: {
          borderColor: "rgba(68, 73, 85, 0.4)",
          backgroundColor: "rgba(16, 21, 32, 0.5)",
        },
        label: {
          color: "#d3d8e4",
        },
        description: {
          color: "#74788a",
        },
      }),
    },

    // Tabs — glass tabs
    Tabs: {
      styles: () => ({
        tab: {
          color: "#74788a",
          borderRadius: 8,
          "&[dataActive]": {
            color: "#d3d8e4",
            borderColor: "#4a7dff",
            background: "rgba(74, 125, 255, 0.08)",
          },
          "&:hover": {
            background: "rgba(74, 125, 255, 0.05)",
          },
        },
        list: {
          borderColor: "rgba(68, 73, 85, 0.2)",
        },
      }),
    },

    // Stepper — cosmic stepper
    Stepper: {
      styles: () => ({
        stepIcon: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(16, 21, 32, 0.7)",
          borderColor: "rgba(68, 73, 85, 0.3)",
        },
        separator: {
          backgroundColor: "rgba(68, 73, 85, 0.3)",
        },
      }),
    },

    // Modal — glass overlay
    Modal: {
      defaultProps: { centered: true },
      styles: () => ({
        content: {
          background:
            "linear-gradient(135deg, rgba(16, 21, 32, 0.95), rgba(26, 22, 37, 0.9))",
          backdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(68, 73, 85, 0.2)",
          borderRadius: 16,
        },
        header: {
          background: "transparent",
        },
        overlay: {
          background: "rgba(5, 8, 16, 0.7)",
        },
      }),
    },

    // Drawer — glass drawer
    Drawer: {
      defaultProps: { position: "right" },
      styles: () => ({
        content: {
          background:
            "linear-gradient(135deg, rgba(16, 21, 32, 0.95), rgba(26, 22, 37, 0.9))",
          backdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(68, 73, 85, 0.2)",
        },
        header: {
          background: "transparent",
        },
      }),
    },

    // Tooltip — glass tooltip
    Tooltip: {
      defaultProps: {
        events: { hover: true, focus: true, touch: false },
      },
      styles: () => ({
        tooltip: {
          background: "rgba(16, 21, 32, 0.9)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(68, 73, 85, 0.2)",
          borderRadius: 8,
          color: "#d3d8e4",
          fontSize: "0.75rem",
        },
      }),
    },

    // ActionIcon — subtle with glow hover
    ActionIcon: {
      defaultProps: { variant: "subtle" },
      styles: () => ({
        root: {
          color: "#74788a",
          borderRadius: 8,
          "&:hover": {
            background: "rgba(74, 125, 255, 0.08)",
            color: "#d3d8e4",
          },
        },
      }),
    },

    // Text
    Text: {
      defaultProps: { size: "sm" },
    },

    // Loader — cosmic blue
    Loader: {
      defaultProps: { color: "#4a7dff" },
    },

    // Progress — cosmic gradient
    Progress: {
      styles: () => ({
        root: {
          backgroundColor: "rgba(68, 73, 85, 0.2)",
          borderRadius: 6,
        },
      }),
    },
  },
});

export const theme = mergeMantineTheme(DEFAULT_THEME, aeGenTheme);
