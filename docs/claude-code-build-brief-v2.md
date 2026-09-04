# Claude Code build brief — photographic hero landing page

> Paste everything below the line into Claude Code from an empty directory. Fill in the `<<< >>>` fields first.

---

Build a single-page marketing site in this directory. Work autonomously — scaffold, build, verify, self-correct — and only stop to ask me if the brief genuinely contradicts itself.

## Product

- **Name:** `<<< product name >>>`
- **Pitch:** `<<< what it does, in one plain sentence >>>`
- **Audience:** `<<< who buys it >>>`
- **Page's single job:** get the visitor to `<<< sign up / book a demo / join waitlist >>>`

Write all copy yourself. Plain active verbs, sentence case, no filler adjectives.

## Banned patterns — read this before anything else

These are the defaults that make a page look generated. None of them may appear.

**Typography**
- No monospace. Not for labels, not for numbers, not for captions, not for the eyebrow. There is no monospace font loaded on this page.
- No letter-spaced uppercase micro-labels. The `LIKE THIS · WITH · DOTS` eyebrow is banned outright. Positive tracking above `0.02em` may not appear anywhere in the stylesheet.
- No typewriter, character-by-character, scramble, decrypt, or terminal-style text animation. Text reveals by line-mask only, as specified below.
- No text gradients, no gradient-filled headlines, no text with a background-clip fill.

**Layout**
- No three-or-four-card feature grid. No row of equal-width rounded boxes each containing an icon, a short title, and two lines of copy. This shape is banned in every section.
- No icons in circles. No icon at all above a heading.
- No `01 / 02 / 03` numbered markers.
- No stat row of three big numbers with small labels beneath.
- No glassmorphism outside the hero composite. Frosted panels belong on the photograph and nowhere else.
- No emoji anywhere.

**If you find yourself reaching for one of these, that's the signal to design the section properly instead.** Structure should come from the content's real shape — a sequence gets a sequence, a comparison gets a comparison, a list of unrelated capabilities gets an editorial list, not a grid of boxes.

## Working method

1. Write `PLAN.md` first: the palette as 5 named hex values, the full type scale with exact clamp values, and one sentence naming the signature element. Then critique it against the banned list and against a generic version of this brief. Change anything that matches and note what you changed.
2. Track the nine sections on your todo list. Build them one at a time.
3. Serve with `python3 -m http.server 8000` in the background. After each section, screenshot at 1440px and 375px with Playwright and actually look at it. Fix what's wrong before moving on. If Playwright isn't installed, install it (`npx playwright install chromium`) — do not build this blind.
4. Commit after each section, naming it (`feat: photographic hero`).
5. Run the acceptance checklist at the end and fix every failure.

## Stack and structure

Vanilla HTML/CSS/JS. No framework, no bundler, no build step, no runtime dependencies. IntersectionObserver and `requestAnimationFrame` only.

```
index.html
styles.css
main.js
PLAN.md
assets/images/
scripts/gen-placeholders.js
```

Three separate files. Do not inline CSS or JS into the HTML.

## Placeholder assets — build these before any section

Write `scripts/gen-placeholders.js` (Node, no dependencies, emits SVG directly) generating every image slot below at its exact stated dimensions. Each renders as a flat warm-grey field showing its slot ID, pixel size, and intended subject, set in the page's own typeface at a normal weight — not in a monospace, not in a dashed-border box.

The page must look proportionally finished before I supply a single real asset. No broken image icons, no CSS-only grey divs that collapse when a real file lands.

Then write `assets/images/MANIFEST.md`: a table of slot ID, filename, dimensions, format, and what belongs there.

## Art direction

**Mood: bright, light, warm.** Daylight, not dark mode. Warmth comes from the hero photograph and open space, not from color washes.

**Type.** One geometric grotesk for the entire page. Tall x-height, straight-tailed `y`, near-circular `o`. Load Figtree from Google Fonts, weights 400/500/600, `font-display: swap`. Stack: `"Figtree", -apple-system, "Segoe UI", system-ui, sans-serif`. This is the only family loaded.

| Role | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| Hero | `clamp(2.5rem, 6.5vw, 5.5rem)` | 500 | `-0.03em` | `1.02` |
| Section head | `clamp(2rem, 4vw, 3.25rem)` | 500 | `-0.025em` | `1.08` |
| Feature name | `clamp(1.4rem, 2.2vw, 1.9rem)` | 500 | `-0.02em` | `1.2` |
| Subhead | `clamp(1.05rem, 1.6vw, 1.35rem)` | 400 | `-0.01em` | `1.5` |
| Body | `1rem` | 400 | `0` | `1.6` |
| Small | `0.875rem` | 400 | `0` | `1.5`, sentence case |

Negative tracking on everything above 1.4rem, zero below. Nothing is uppercase except the wordmark if the logo calls for it. Never bold below 20px. Secondary text sits at 70% opacity so headlines hold the contrast.

**Color.** Base `#FBF8F4`, text `#141210`. Honey `#F2B01E` for small highlights and active states only. One cool counterpoint `#3B4DE8`, used no more than three times on the entire page. Hairlines at 10% black. No gradients on flat surfaces — the only gradients live inside the photographic and glass elements.

**Shape.** Interactive elements are full pills (`border-radius: 999px`). Image containers are 20px. Those are the only two radius values in the stylesheet. Buttons carry an inline `→` after the label with a 6px gap.

**Layout.** 12-column grid, 1280px max, `clamp(5rem, 10vh, 8rem)` between sections. The hero is centered; every section below it is asymmetric — text spanning 5 columns against imagery spanning 7, alternating sides — so the centered hero reads as a deliberate opening rather than the page's default alignment.

Every color, size, spacing step, radius, and easing curve lives in one `:root` block. I should be able to retheme by editing that block alone.

## Motion

One system, reused. Nothing scattered.

- **Load.** The hero headline reveals by line: each line inside an `overflow: hidden` mask, `translateY(105% → 0)`, 850ms, `cubic-bezier(0.16, 1, 0.3, 1)`, staggered 90ms. Whole lines move as units — no per-character or per-word animation. Subhead and buttons fade up 14px after, 70ms apart. Hero image scales `1.04 → 1` over 1.6s at the same time.
- **Hero parallax.** Composited layers drift on scroll at different rates — background 0.15, mid 0.35, front 0.55 — driven by `requestAnimationFrame`. Mouse-follow tilt of at most 6px translation, no rotation.
- **Floating cards.** Slow independent loops, 8–12s, 6px amplitude, offset so they never sync.
- **Scroll reveal.** One `.reveal` class with `data-stagger`, firing once at 20% visibility: `opacity 0 → 1`, `translateY(28px → 0)`, 700ms, children 70ms apart.
- **Hover.** Pills invert fill over 300ms while the label stays put. Links draw an underline from `scaleX(0)`, `transform-origin: left`. Images inside 20px containers scale to `1.03` behind `overflow: hidden`.
- **Nav.** Transparent over the hero; white with `backdrop-filter: blur(14px)` and a hairline border after 90px of scroll, over 300ms.

Transforms and opacity only — never animate `top`, `left`, `width`, or `height`. All of it inside `@media (prefers-reduced-motion: reduce)` guards: reveals instant, parallax and float off, hero static.

## Sections

Build in order. Comment each as `<!-- 02 — photographic hero -->`.

**01 — Nav.** Wordmark and mark left, four text links center, `Login` and one filled pill CTA right. `[IMG-01]` logo mark, 32×32. Mobile: full-screen overlay, links staggering up.

**02 — Photographic hero.** The signature — spend the complexity budget here.
- `[IMG-02]` full-bleed background photograph, 2400×1800, a real surface shot at an oblique angle. Vignette in CSS, not baked into the file.
- Centered over it: a two-line headline, a one-sentence subhead, two pill buttons — one solid white, one outlined. No eyebrow label above the headline; the headline opens the page.
- `[IMG-03]` primary device shot, 1600×1200 transparent PNG, lower-left, rotated into the photograph's perspective plane.
- `[IMG-04]`, `[IMG-05]` secondary composited elements, 800×800 transparent PNG, lower-right.
- Four floating notification panels in pure CSS on top: `rgba(255,255,255,0.72)`, `backdrop-filter: blur(20px)`, pill radius, soft shadow, each rotated 2–8° and skewed to match the scene's perspective. Each holds `[IMG-06]`–`[IMG-09]`, 40×40, plus two lines of specific, real-sounding copy. These are the only frosted elements on the page.

**03 — Proof strip.** One quiet row of logos, `[IMG-10]`–`[IMG-15]` at 130×34, 45% opacity going to 100% on hover. No heading above it, no box around it.

**04 — How it works.** Three steps, and because these genuinely are a sequence, treat them as one continuous vertical run rather than three boxes: each step is a full-width band with `[IMG-16]`–`[IMG-18]` at 1000×750 on one side and the step's name and two sentences on the other, alternating sides down the page, separated by hairline rules. No containers around the text, no numbers, no icons. On desktop the text column sticks while its image scrolls past.

**05 — Capability list.** The things the product does, as an editorial list rather than a grid: each item is a full-width row with the feature name at feature-name scale on the left and one sentence of description on the right, separated by a hairline rule, hovering to a subtle background tint. Five to seven items. No icons, no cards, no columns of boxes. `[IMG-19]` sits above the list as a single 1440×600 band.

**06 — Accent moment.** The one section that inverts to `#3B4DE8`. A single pull-quote or claim at near-hero scale, and nothing else in the block — no supporting stats, no image, no button. The restraint is the point.

**07 — Detail split.** One asymmetric row: `[IMG-20]` at 1100×850 on the left, and on the right a heading plus three short paragraphs separated by spacing, not rules or boxes.

**08 — Testimonial.** One quote, set at section-head scale. `[IMG-21]`, 96×96 circular avatar, with name and role beneath. No carousel, no quotation-mark graphic, no card.

**09 — Closing CTA and footer.** The hero headline treatment at 80% scale over `[IMG-22]`, 2400×1000 — a second photograph from the same shoot, so the page closes where it opened. One pill button, nothing else. Footer directly beneath: four link columns, wordmark, thin legal row, static.

## Acceptance checklist

Run every item, fix failures, and report each result.

- [ ] `grep -iE "monospace|ui-monospace|Menlo|Consolas|Courier|SFMono" styles.css` returns nothing.
- [ ] `grep -E "letter-spacing:\s*0\.[0-9]" styles.css` returns nothing — no positive tracking anywhere.
- [ ] `grep -i "text-transform:\s*uppercase" styles.css` returns nothing outside the wordmark rule.
- [ ] No `background-clip: text` anywhere.
- [ ] No section contains three or more sibling elements sharing a card class with an icon and a heading inside.
- [ ] Exactly two radius values exist: `999px` and `20px`.
- [ ] `#3B4DE8` appears no more than three times.
- [ ] `backdrop-filter` appears only in the hero and nav rules.
- [ ] Every color, size, and radius resolves to a `:root` variable — grep for stray hex values and raw px sizes outside `:root`.
- [ ] Screenshots at 1440, 768, and 375 look correct. Hero type does not overflow at 375; composited hero elements reduce to two on mobile, not five.
- [ ] No horizontal scrollbar between 320 and 2560px.
- [ ] Zero console errors, zero 404s.
- [ ] Every image has explicit `width`/`height`; layout does not shift between first paint and full load.
- [ ] Under emulated `prefers-reduced-motion: reduce`, all content is visible and correctly placed with no animation running.
- [ ] Tab through the page: focus always visible, order logical.
- [ ] No `localStorage` or `sessionStorage`.
- [ ] `assets/images/MANIFEST.md` lists all 22 slots.
