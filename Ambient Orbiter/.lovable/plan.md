
Goal: make the orb read as a stable cosmic mind, with clearly visible stars and thought bubbles that feel attached to the orb rather than hidden behind it.

1. Fix the starfield so it stops reading as “static”
- Rework the shader’s star layers in `src/components/AiOrb.tsx` so the base star count is lower but each star is larger and more intentional.
- Remove most time-driven variation from the main stars; only a small subset of larger “hero stars” should pulse very subtly.
- Increase star core size and contrast so stars appear as clear pinpoints with a bright center and soft halo, instead of tiny noisy specks.
- Keep stars locked to stable object-space coordinates so they do not appear to drift across the orb.

2. Fix the thought bubble anchor geometry
- Replace the current `left: thought.x` + `translateX(-100%)` positioning in `src/components/AiThinkingBubble.tsx`, which is causing bubbles to visually collapse into or behind the orb.
- Anchor each thought from the orb’s perimeter using explicit top-left offsets relative to the orb center, with a minimum clearance from the orb radius.
- Constrain all slots to the upper-left / left side only, since the orb sits near the bottom-right edge of the viewport.
- Ensure the nearest point of each bubble just “kisses” the orb edge without overlapping the orb body.

3. Make thought timing truly sequential
- Change the show/hide lifecycle so the next thought is not scheduled until the previous one is fully gone.
- Shorten the fade-in so thoughts feel like quick mental flashes, then hold longer, then fade out cleanly.
- Remove the current overlap between the hide duration and the next show timeout.

4. Tighten the thought slot system
- Replace the current slot coordinates with a smaller curated set of positions clustered around the orb’s upper-left arc.
- Add simple collision-safe spacing rules so bubbles cannot stack on top of one another if timings ever drift.
- Keep connector lines short and directional so they visually reinforce attachment to the orb.

5. Match the thought styling to the orb
- Update the thought bubble visuals to echo the orb’s cosmic palette: darker void body, sharper luminous rim, faint nebula tint, brighter “starlight” text accents.
- Keep the bubble readable and minimal, but make it feel like it emerged from the same material system as the orb.

Technical notes
- Root cause of “behind the orb”: the current bubble wrapper is inside the orb’s 110x110 absolute box, and bubble placement is based on tiny positive `x` offsets (`8–18px`) plus `translateX(-100%)`, so the final rendered box hugs the orb too tightly and can visually sit beneath it.
- Root cause of star “movement/static”: the shader still animates star intensity continuously via `sin(uTime * twinkleSpeed + ...)` across many stars and three densities, which creates a noisy shimmer even if positions are stable.
- The clean implementation path is:
```text
AiOrb.tsx
- fewer star layers
- larger star radius bands
- almost no animation on normal stars
- rare slow pulse on selected bright stars

AiThinkingBubble.tsx
- place thoughts from orb-center math, not tiny box offsets
- sequential queue with full clear-before-next-show
- slots biased upper-left / left only
```

Expected result
- The orb feels like a cosmic intelligence with visible, stable stars.
- Thought bubbles appear around the orb, close enough to feel attached, never behind it, never overlapping, and never cross-fading into each other.
