# Claude Code build brief — photographic hero landing page

> Paste everything below the line into Claude Code from an empty directory. Fill in the `<<< >>>` fields first.

---

Build a single-page marketing site in this directory. Work autonomously through the whole brief — scaffold, build, verify, and self-correct — and only stop to ask me if something in the brief genuinely contradicts itself.

## Product

- **Name:** `<<< product name >>>`
- **Pitch:** `<<< what it does, in one plain sentence >>>`
- **Audience:** `<<< who buys it >>>`
- **Page's single job:** get the visitor to `<<< sign up / book a demo / join waitlist >>>`

Write all copy yourself. Plain active verbs, sentence case, no filler adjectives, nothing that sounds like it was generated. The headline states what the product does, not how it feels.

## Working method

1. Start by writing `PLAN.md`: the palette as 5 named hex values, the full type scale with exact clamp values, and one sentence naming the signature element. Then critique it — if any line is what you'd produce for any other product page, change it and note what you changed. Keep this file updated as you go.
2. Use your todo list to track the ten sections below. Build them in order, one at a time.
3. Serve with `python3 -m http.server 8000` in the background. After each section, screenshot at 1440px and 375px with Playwright and look at the result. Fix what's wrong before moving on. If Playwright isn't available, install it (`npx playwright install chromium`) rather than skipping verification — building this blind will produce a broken layout.
4. Commit after each section with a message naming it (`feat: photographic hero`).
5. When all sections are done, run the acceptance checklist at the bottom and fix every failure.

## Stack and structure

Vanilla HTML/CSS/JS. No framework, no bundler, no build step, no npm dependencies in the page itself. IntersectionObserver and `requestAnimationFrame` only.

```
index.html
styles.css
main.js
PLAN.md
assets/images/          # all placeholders live here
scripts/gen-placeholders.js
```

Do not inline the CSS or JS into `index.html`. Three files, clearly separated.

## Placeholder assets — do this before building sections

Write `scripts/gen-placeholders.js` (Node, no dependencies — emit SVG files directly) that generates every image slot listed in the sections below at its exact stated dimensions. Each placeholder should render as a flat warm-grey card showing its slot ID, pixel dimensions, and intended subject in the page's own typeface. Run it once, commit the output.

This matters: the page must look complete and correctly proportioned before I supply a single real asset. No broken image icons, no CSS-only grey boxes that collapse when a real file replaces them.

Then write `assets/images/MANIFEST.md` — a table of slot ID, filename, dimensions, format, and what I should put there. This is the document I'll work from when I swap in my content.

## Art direction

**Mood: bright, light, fun.** Daylight, not dark mode. Warmth comes from the hero photograph and generous whitespace, not from heavy color washes. It should feel like a sunlit desk.

**Type.** One geometric grotesk for the entire page — no serif, no second display face. Tall x-height, straight-tailed `y`, near-circular `o`. Load Figtree from Google Fonts (weights 400/500/600) with `font-display: swap`; stack is `"Figtree", -apple-system, "Segoe UI", system-ui, sans-serif`.

| Role | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| Hero | `clamp(2.5rem, 6.5vw, 5.5rem)` | 500 | `-0.03em` | `1.02` |
| Section head | `clamp(2rem, 4vw, 3.25rem)` | 500 | `-0.025em` | `1.08` |
| Subhead | `clamp(1.05rem, 1.6vw, 1.35rem)` | 400 | `-0.01em` | `1.5` |
| Body | `1rem` | 400 | `0` | `1.6` |
| Eyebrow | `0.75rem` | 500 | `0.12em` | `1.2`, uppercase |

Never bold below 20px. Subheads sit at 70% opacity so headlines hold the contrast.

**Color.** Warm off-white base `#FBF8F4`, text `#141210`. Honey accent `#F2B01E` for badges, active states, and small highlights only. One cool counterpoint `#3B4DE8` used no more than three times on the page — primary CTA and the accent band. Hairlines at 10% black. No gradients on flat surfaces; the only gradients are inside the photographic and glass elements.

**Shape.** Everything interactive is a full pill (`border-radius: 999px`). Every container is 20px. There is no third radius value in the stylesheet. Buttons carry an inline `→` after the label with a 6px gap.

**Layout.** 12-column grid, 1280px max, `clamp(5rem, 10vh, 8rem)` between sections. The hero is centered; every section below is asymmetric — 5 columns of text against 7 of imagery — so the centered hero reads as a deliberate opening rather than the page's default.

Every color, size, spacing step, radius, and easing curve goes in one `:root` block. I should be able to retheme the page by editing that block alone.

## Motion

One system, reused. No scattered effects.

- **Load.** Hero headline reveals line by line — each line in an `overflow: hidden` mask, `translateY(105% → 0)`, 850ms, `cubic-bezier(0.16, 1, 0.3, 1)`, staggered 90ms. Subhead and buttons fade up 14px after, at 70ms intervals. Hero image scales `1.04 → 1` over 1.6s simultaneously.
- **Hero parallax.** Composited layers drift on scroll at different rates — background 0.15, mid cards 0.35, front cards 0.55 — via `requestAnimationFrame`. Add mouse-follow tilt, max 6px translation, no rotation.
- **Floating cards.** Slow independent loops, 8–12s, 6px amplitude, offset delays so they never sync.
- **Scroll reveal.** One reusable `.reveal` class with `data-stagger`. Fires once at 20% visibility: `opacity 0 → 1`, `translateY(28px → 0)`, 700ms, same easing, children staggered 70ms.
- **Hover.** Pills invert fill over 300ms while the label stays fixed. Cards lift `-6px`, shadow blur 20px → 40px. Links draw an underline from `scaleX(0)`, `transform-origin: left`.
- **Nav.** Transparent over the hero; white with `backdrop-filter: blur(14px)` and a hairline border after 90px scroll, 300ms.

All transforms only — never animate `top`, `left`, `width`, or `height`. Everything wrapped in `@media (prefers-reduced-motion: reduce)`: reveals instant, parallax and float disabled, hero static.

## Sections

Build in order. Comment each as `<!-- 02 — photographic hero -->`.

**01 — Nav.** Wordmark plus mark left, four text links center, `Login` and one filled pill CTA right. `[IMG-01]` logo mark, 32×32. Mobile: full-screen overlay, links staggering up on open.

**02 — Photographic hero.** The signature. Spend the complexity budget here.
- `[IMG-02]` full-bleed background photograph, 2400×1800 — a real surface at an oblique angle. Soft vignette applied in CSS, not baked in.
- Centered over it: eyebrow, two-line headline, one-sentence subhead, two pill buttons (one solid white, one outlined).
- `[IMG-03]` primary device shot, 1600×1200 transparent PNG, lower-left, rotated into the photo's perspective plane.
- `[IMG-04]`, `[IMG-05]` secondary composited elements, 800×800 transparent PNG, lower-right.
- Four **floating glass notification cards** built in pure CSS on top: `rgba(255,255,255,0.72)`, `backdrop-filter: blur(20px)`, pill radius, soft shadow, each rotated 2–8° and skewed slightly to match the scene. Each holds `[IMG-06]`–`[IMG-09]`, 40×40 avatar or app icon, plus two lines of real, specific copy. These prove the product is alive.

**03 — Proof strip.** One quiet row. `[IMG-10]`–`[IMG-15]`, 130×34 logos at 45% opacity, 100% on hover.

**04 — How it works.** Three steps, horizontal on desktop, stacked on mobile. Numbered markers are correct here because these genuinely are a sequence. `[IMG-16]`–`[IMG-18]`, 900×675 each, above each step's text, in 20px-radius containers with a warm shadow.

**05 — Feature split.** Two alternating rows: text left / `[IMG-19]` right, then `[IMG-20]` left / text right. 1000×800 each. Text column sticky on desktop while the image scrolls past.

**06 — Accent band.** The one section that inverts to `#3B4DE8`. A single large statistic or pull-quote at near-hero scale, plus `[IMG-21]`, 1600×700 full-bleed beneath. The only saturated block on the page.

**07 — Feature grid.** Four cards: icon, 3–5 word title, two lines of copy. `[IMG-22]`–`[IMG-25]`, 640×480 each. Staggered reveal, single column below 768px.

**08 — Testimonial.** One quote, set large. `[IMG-26]`, 96×96 circular avatar, with name and role. No carousel.

**09 — Closing CTA.** Hero headline treatment at 80% scale over `[IMG-27]`, 2400×1000 — a second photograph from the same shoot, so the page closes where it opened. One pill button, nothing else.

**10 — Footer.** Four link columns, wordmark, thin legal row. Static.

## Acceptance checklist

Run every item and fix failures before telling me you're done. Report the result of each.

- [ ] Screenshots at 1440, 768, and 375 look correct. Hero type does not overflow at 375. Composited hero elements reduce to two on mobile, not five.
- [ ] No horizontal scrollbar at any width from 320 to 2560.
- [ ] Zero console errors and zero 404s in the network log.
- [ ] Every image has explicit `width`/`height`. Verify cumulative layout shift is near zero by comparing a screenshot taken at first paint against one after full load.
- [ ] Every color, size, and radius in `styles.css` resolves to a `:root` variable. Grep for stray hex values and raw px sizes outside `:root` — there should be none.
- [ ] Exactly two radius values exist in the stylesheet: `999px` and `20px`.
- [ ] `#3B4DE8` appears no more than three times.
- [ ] Emulating `prefers-reduced-motion: reduce`, all content is visible and correctly positioned with no animation running.
- [ ] Tab through the whole page: focus is always visible and order is logical.
- [ ] No `localStorage` or `sessionStorage` anywhere.
- [ ] `assets/images/MANIFEST.md` lists all 27 slots with dimensions and intended subject.
