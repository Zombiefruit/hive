# Aegen Design System — Style Guide

> A cosmic, ambient, intelligence-forward design language. Think: deep space observatory meets quiet AI consciousness.

---

## Color Palette

### Core Colors (HSL)
| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| **Void** | `220 40% 3%` | `#050810` | Deepest backgrounds, emptiness |
| **Deep Space** | `220 30% 8%` | `#101520` | Primary surfaces, cards |
| **Nebula Dark** | `260 20% 12%` | `#1a1625` | Secondary surfaces, elevated cards |
| **Cosmic Blue** | `220 80% 60%` | `#4a7dff` | Primary accent, interactive elements, links |
| **Stellar Purple** | `270 60% 65%` | `#a855f7` | Secondary accent, highlights, hover states |
| **Plasma Cyan** | `195 85% 60%` | `#38bdf8` | Tertiary accent, data, active states |
| **Star White** | `220 15% 85%` | `#d3d8e4` | Primary text |
| **Dust Gray** | `220 10% 50%` | `#74788a` | Secondary text, timestamps, muted |
| **Dim Gray** | `220 10% 30%` | `#444955` | Borders, separators |

### Escalation / Alert Colors
| Token | HSL | Hex | Usage |
|-------|-----|-----|-------|
| **Alert Warm** | `15 90% 55%` | `#ff6b3d` | Escalation, warnings, urgent |
| **Alert Deep** | `15 90% 45%` | `#d94b1a` | Escalation glow, urgent backgrounds |
| **Alert Gold** | `35 90% 55%` | `#ffaa33` | Caution, stalled states |

### Functional
| Token | HSL | Usage |
|-------|-----|-------|
| **Success** | `150 60% 45%` | Completed, resolved |
| **Info** | `195 85% 60%` | Same as Plasma Cyan |

---

## Typography

### Font Stack
```
--font-primary: 'Inter', -apple-system, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
```

### Usage
- **Body text**: `font-primary`, 13–14px, `Star White`
- **Labels / metadata**: `font-mono`, 9–11px, `Dust Gray`, uppercase tracking `0.1–0.2em`
- **Thought text / ephemeral content**: `font-primary`, 11.5px, `Star White` at 80–90% opacity
- **Timestamps**: `font-mono`, 8–10px, `Dust Gray` at 40–60% opacity
- **Headings**: `font-primary`, semibold, `Star White`

---

## Surfaces & Glass

### Glassmorphism Formula
All elevated surfaces use this pattern:
```css
background: hsl(220 30% 8% / 0.65–0.8);
backdrop-filter: blur(16–24px) saturate(1.2–1.4);
border: 1px solid hsl(220 10% 30% / 0.15–0.3);
border-radius: 12–16px;
```

### Surface Hierarchy
1. **Page background**: Solid `Void` or `Deep Space`
2. **Cards / panels**: Glass with `Deep Space` at 65–80% opacity
3. **Popovers / floating UI**: Glass with `Nebula Dark` at 60–75% opacity
4. **Tooltips / ephemeral**: Glass with `Deep Space` at 50–60% opacity

### Box Shadows
```css
/* Ambient glow — use accent color */
box-shadow: 0 0 12px hsl(220 80% 60% / 0.1),
            inset 0 0 12px hsl(220 80% 60% / 0.03);

/* Elevated surface */
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
            0 0 0 1px hsl(220 80% 60% / 0.05);

/* Alert/escalation surface */
box-shadow: 0 0 16px hsl(15 90% 55% / 0.15),
            inset 0 0 12px hsl(15 90% 55% / 0.05);
```

---

## Glow & Light Effects

### Principles
- Light comes from within, not from above. Elements should feel **self-luminous**.
- Use `radial-gradient` for inner glow accents on surfaces.
- Use `text-shadow` with accent colors for important text.
- Use `box-shadow` with accent color for ambient glow on interactive elements.

### Text Glow
```css
/* Primary accent text */
text-shadow: 0 0 8px hsl(220 80% 60% / 0.2);

/* Alert text */
text-shadow: 0 0 8px hsl(15 90% 55% / 0.3);
```

### Inner Glow Accent (on cards/surfaces)
```css
/* Small radial gradient positioned in corner */
background: radial-gradient(
  circle at top right,
  hsl(220 80% 60% / 0.08) 0%,
  transparent 60%
);
```

### Ambient Bleed (behind important elements)
```css
/* Large soft glow behind a focal element */
background: radial-gradient(
  circle,
  hsl(220 80% 60% / 0.06) 0%,
  transparent 50%
);
```

---

## Animation & Motion

### Principles
- Motion should feel **organic and breathing**, never mechanical.
- Elements enter with blur → sharp, not slide or bounce.
- Exits dissolve upward with blur.
- Idle elements should subtly breathe (scale ±2%, opacity ±10%).

### Transitions
```
--ease-cosmic: cubic-bezier(0.23, 1, 0.32, 1);  /* Primary easing */
--duration-whisper: 0.3–0.5s;  /* Enter/exit of ephemeral content */
--duration-breathe: 3–4s;      /* Idle breathing loops */
--duration-pulse: 1.5–2.5s;    /* Active/thinking pulse */
```

### Entry Pattern (thoughts, tooltips, notifications)
```
initial:  { opacity: 0, filter: blur(6px), y: 8 }
animate:  { opacity: 1, filter: blur(0px), y: 0 }
```

### Exit Pattern
```
exit:     { opacity: 0, filter: blur(4px), y: -8 }
```

### Breathing (idle living elements)
```
animate: { scale: [1, 1.02, 1], opacity: [0.8, 1, 0.8] }
duration: 3–4s, repeat: Infinity, ease: easeInOut
```

---

## Interactive Elements

### Buttons
- **Primary**: `Cosmic Blue` background, slight glow shadow, scale 1.05 on hover
- **Ghost**: Transparent, `Cosmic Blue` text, glass background on hover
- **Destructive/Alert**: `Alert Warm` background, warm glow
- All buttons: `border-radius: 10–12px`, subtle glass treatment

### Hover
```css
transform: scale(1.03–1.06);
transition: all 0.2s var(--ease-cosmic);
box-shadow: 0 0 16px hsl(220 80% 60% / 0.15);
```

### Focus
```css
outline: none;
box-shadow: 0 0 0 2px hsl(220 80% 60% / 0.4);
```

---

## Layout Principles

- **Spacing**: Use 4px grid. Generous padding (16–24px in cards).
- **Corners**: 12–16px radius for cards/panels, 8–10px for buttons/inputs, 20px+ for pills.
- **Borders**: Always use `Dim Gray` at 15–30% opacity. Never solid opaque borders.
- **Content density**: Favor breathing room over information density. Ambient > dashboard.

---

## The Orb Metaphor

The AI orb is the emotional center of the interface. Its design language should echo throughout:

- **Cosmic gradients** on hero sections or empty states
- **Twinkling points** as decorative elements (loading states, backgrounds)
- **Nebula color shifts** for state transitions (calm blue → alert orange)
- **Thought-like ephemeral UI** — notifications, toasts, and status updates should feel like whispered thoughts, not alert banners
- **Self-luminous elements** — important UI glows from within rather than being highlighted from outside

---

## Component Patterns

### Cards
```
Glass surface + inner glow accent + subtle border
Content uses Star White + Dust Gray hierarchy
Optional cosmic gradient header
```

### Notifications / Toasts
```
Appear like thoughts: blur-in from nearby, drift, blur-out
Small, rounded, glass background
Accent-colored left border or inner glow
Auto-dismiss with fade, no hard close
```

### Data Tables / Lists
```
Glass surface, no harsh row borders
Alternate row: very subtle opacity shift (2-3%)
Active/selected row: inner glow with accent color
Monospace for data values, proportional for labels
```

### Status Indicators
```
Calm/normal: Cosmic Blue pulsing dot
Active/working: Plasma Cyan steady
Warning/stalled: Alert Gold breathing
Escalation/error: Alert Warm urgent pulse
Success/done: Green (150 60% 45%) fade-in
```

---

## Voice & Tone (for AI-generated text)

- **Ambient, not alarming**: "Task stalled 15min — escalating" not "WARNING: TIMEOUT"
- **Observational**: "All subtasks done — advancing parent" not "COMPLETED!"
- **Lowercase feeling**: Even if capitalized, the energy should be calm and matter-of-fact
- **Present tense**: "checking dependencies" not "checked dependencies"

---

*This guide captures the design language of the Aegen orchestrator. Every surface should feel like looking into a quiet cosmos — dark, luminous, alive.*
