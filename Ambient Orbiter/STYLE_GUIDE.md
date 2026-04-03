# Aegen Design System — Style Guide

> A cosmic-intelligence aesthetic: deep void backgrounds, luminous accent glows, glass surfaces, and purposeful motion. The orb is the soul of the system — all UI should feel like it emerged from the same universe.

---

## 1. Color Tokens

### Dark Mode (default)

| Token | HSL | Usage |
|---|---|---|
| `--void` | `228 36% 5%` | Page background, deepest surfaces |
| `--void-elevated` | `228 30% 8%` | Cards, panels, elevated surfaces |
| `--void-overlay` | `248 34% 11%` | Modals, overlays, popover backgrounds |
| `--cosmic-blue` | `222 100% 64%` | Primary accent, links, active states |
| `--cosmic-purple` | `268 88% 66%` | Secondary accent, gradients |
| `--cosmic-cyan` | `196 92% 60%` | Tertiary accent, highlights |
| `--star-white` | `214 100% 91%` | Primary text on dark backgrounds |
| `--star-muted` | `220 30% 75%` | Secondary text, descriptions |
| `--star-dim` | `220 20% 50%` | Tertiary text, timestamps, placeholders |
| `--nebula-border` | `220 60% 50% / 0.2` | Default border color |
| `--nebula-border-bright` | `220 70% 60% / 0.28` | Active / focused border |
| `--alert-warm` | `18 100% 62%` | Escalation/warning primary |
| `--alert-warm-text` | `18 75% 88%` | Warning text on dark surfaces |
| `--alert-warm-border` | `15 80% 50% / 0.32` | Warning border |

### Light Mode

| Token | HSL | Usage |
|---|---|---|
| `--void` | `220 20% 97%` | Page background |
| `--void-elevated` | `220 25% 100%` | Cards, panels |
| `--void-overlay` | `220 20% 95%` | Modals, overlays |
| `--cosmic-blue` | `222 85% 52%` | Primary accent (slightly deeper for contrast) |
| `--cosmic-purple` | `268 72% 55%` | Secondary accent |
| `--cosmic-cyan` | `196 80% 42%` | Tertiary accent |
| `--star-white` | `228 36% 12%` | Primary text (near-black) |
| `--star-muted` | `220 20% 36%` | Secondary text |
| `--star-dim` | `220 14% 58%` | Tertiary text |
| `--nebula-border` | `220 25% 82%` | Default border |
| `--nebula-border-bright` | `222 50% 72%` | Active border |
| `--alert-warm` | `12 90% 52%` | Escalation primary |
| `--alert-warm-text` | `12 80% 35%` | Warning text on light surfaces |
| `--alert-warm-border` | `12 70% 75%` | Warning border |

### Gradient Presets

```css
/* Dark mode backgrounds */
--gradient-void: linear-gradient(180deg, hsl(228 36% 5%), hsl(248 34% 8%));
--gradient-surface: linear-gradient(135deg, hsl(228 36% 7% / 0.9), hsl(248 34% 11% / 0.82));
--gradient-glow-blue: radial-gradient(circle, hsl(222 100% 64% / 0.12) 0%, transparent 70%);
--gradient-glow-warm: radial-gradient(circle, hsl(18 100% 62% / 0.15) 0%, transparent 70%);

/* Light mode backgrounds */
--gradient-void-light: linear-gradient(180deg, hsl(220 20% 97%), hsl(220 25% 94%));
--gradient-surface-light: linear-gradient(135deg, hsl(0 0% 100% / 0.9), hsl(220 20% 97% / 0.85));
--gradient-glow-blue-light: radial-gradient(circle, hsl(222 85% 52% / 0.08) 0%, transparent 70%);
```

---

## 2. Typography

| Role | Size | Weight | Color Token |
|---|---|---|---|
| Page heading | `text-2xl` (24px) | `font-semibold` | `--star-white` |
| Section heading | `text-lg` (18px) | `font-medium` | `--star-white` |
| Body text | `text-sm` (14px) | `font-normal` | `--star-muted` |
| UI labels / chat bubbles | `text-[12.5px]` | `font-normal` | `--star-white` or `--star-muted` |
| Thought bubbles | `text-[11.5px]` | `font-normal` | `--star-white` |
| Timestamps / meta | `text-[10px]` | `font-normal` | `--star-dim` |

**Font stack:** System default (`font-sans`). Monospace for timestamps and code: `font-mono`.

**Text glow** (dark mode only):
```css
text-shadow: 0 0 10px hsl(222 100% 64% / 0.18);  /* blue accent text */
text-shadow: 0 0 10px hsl(18 100% 62% / 0.25);    /* warm/escalation */
```

---

## 3. Glassmorphism

All elevated surfaces use a consistent glass formula:

```css
/* Dark mode */
background: linear-gradient(135deg, hsl(228 36% 7% / 0.9), hsl(248 34% 11% / 0.82));
backdrop-filter: blur(16px) saturate(1.3);
border: 1px solid hsl(220 60% 50% / 0.2);
box-shadow: 0 0 20px hsl(220 90% 60% / 0.14), inset 0 0 16px hsl(220 90% 65% / 0.05);

/* Light mode */
background: linear-gradient(135deg, hsl(0 0% 100% / 0.85), hsl(220 20% 97% / 0.78));
backdrop-filter: blur(16px) saturate(1.2);
border: 1px solid hsl(220 25% 82%);
box-shadow: 0 2px 12px hsl(220 30% 50% / 0.08), inset 0 1px 0 hsl(0 0% 100% / 0.5);
```

**Highlight line** (top edge accent):
```css
/* Dark: luminous edge */
background: linear-gradient(90deg, transparent, hsl(222 100% 80% / 0.75), transparent);
height: 1px;

/* Light: subtle silver */
background: linear-gradient(90deg, transparent, hsl(220 30% 70% / 0.5), transparent);
```

---

## 4. Motion & Animation

All motion uses **Framer Motion** with these patterns:

### Breathing (orb, ambient elements)
```
scale: 1 + sin(t * 0.68) * 0.035 + sin(t * 1.05) * 0.015
```
Slow, organic, never jarring. Two layered sine waves at different frequencies.

### Thought bubble lifecycle
- **Enter:** `duration: 0.16s`, `ease: easeOut`, `scale: 0.92 → 1`, `opacity: 0 → 1`
- **Hold:** `4300ms`
- **Exit:** `duration: 0.38s`, `ease: easeOut`, `scale: 1 → 0.97`, `opacity: 1 → 0`
- **Gap between thoughts:** `320ms` after exit before next enters
- **Sequential only:** `AnimatePresence mode="wait"` — never overlap

### Panel transitions
- **Open:** `duration: 0.25s`, `ease: easeOut`, `y: 20 → 0`, `scale: 0.95 → 1`
- **Close:** reverse of open

### Interactive elements
- **Hover:** `scale: 1.06`, spring `stiffness: 400, damping: 18`
- **Tap:** `scale: 0.95`
- **Color transitions:** `transition-colors` (CSS), ~150ms

---

## 5. Elevation & Layering

| Layer | z-index | Example |
|---|---|---|
| Page content | `0` | Main dashboard |
| Floating orb | `50` | `AiThinkingBubble` container |
| Chat panel | `60` | `AiChatPanel` |
| Toasts / alerts | `70` | System notifications |

---

## 6. Component Patterns

### Cards / Panels
- `rounded-2xl` for major panels
- `rounded-xl` for smaller elements (bubbles, inputs)
- `rounded-lg` for buttons, tabs
- Always use glass background formula from §3
- Inner glow accent dot in top-right corner (radial gradient, 12×12px)

### Buttons
- Ghost style by default: transparent bg, `hover:bg-white/5` (dark) or `hover:bg-black/5` (light)
- Active/selected: `hsl(222 60% 50% / 0.25)` background
- Text: `--star-white` when active, `--star-dim` when inactive

### Input fields
- Dark: `hsl(228 30% 10% / 0.7)` bg, `hsl(220 40% 25% / 0.3)` border
- Light: `hsl(220 20% 96%)` bg, `hsl(220 25% 82%)` border
- Placeholder: `--star-dim`
- Focus ring: `--cosmic-blue` at 30% opacity

### Chat bubbles
- **AI messages:** glass surface bg, `--star-muted` text
- **User messages:** `hsl(222 60% 45% / 0.3)` bg (dark) / `hsl(222 85% 52% / 0.12)` (light), `--star-white` text
- Max width: 85% of container
- `rounded-xl`, `px-3 py-2`

---

## 7. The Orb

The orb is the system's identity. It appears in two contexts:

### Full orb (bottom-right floating)
- 110×110px Canvas with WebGL shader
- Two-layer architecture:
  - **Portal Core** (inner sphere, r=0.92): Fixed starfield rendered in object-space. Stars never move. Deep void background with HDR bloom on bright stars.
  - **Nebula Shell** (outer sphere, r=1.0): Animated color bands, breathing scale, additive blending. Transparent in center so stars show through, opaque at edges (fresnel).
- Glow layers: Two BackSide spheres at r=1.1 and r=1.28 for soft ambient halo.

### Mini orb (chat panel header)
- 36×36px version of the same Canvas. Same shaders, smaller.

### Orb colors
- **Normal:** Blue → Purple → Cyan gradient shell
- **Escalation:** Orange → Red → Amber gradient shell, warm star tint

---

## 8. Spacing & Layout

- Page padding: `p-8` desktop
- Panel internal padding: `px-4 py-3`
- Element gap: `space-y-3` for message lists
- Bubble padding: `px-3 py-2` or `px-3 py-2.5`
- Fixed positioning for floating elements: `bottom-5 right-8`

---

## 9. Scrollbars (dark mode)

```css
scrollbar-width: thin;
scrollbar-color: hsl(220 30% 25%) transparent;
```

Light mode: `scrollbar-color: hsl(220 20% 80%) transparent;`

---

## 10. Accessibility Notes

- All interactive elements must be focusable
- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text
- The orb click target is the full 110×110 div (not just the visible sphere)
- `pointer-events-none` on decorative elements, `pointer-events-auto` on interactive ones
- Thought bubbles are decorative (no interaction needed)
