# BonaBlock design language

> See it. Report it. Prove it.

BonaBlock should feel like a trustworthy civic notice written by someone who
lives nearby: pale stone paper, dark umber ink, and the photographs carrying
the colour. It is read on a mid-range Android phone, outdoors, often with one
thumb. Everything below follows from that.

The palette is called **Stone and umber** and was measured from the fourteen
photographs (2026-11-18): they are saddle brown, umber, ochre, sand and warm
stone, with a little olive shade and jacaranda sky. There is no bright green
in them, so there is none in the interface. The owner chose it, with the brick
logo, Bricolage Grotesque with Hanken Grotesk, and pill buttons, from
`docs/design/simplify/` and the look options page.

Tokens live in `src/app/globals.css` and are the only colours, sizes and
shadows components may use. Components live in `src/components/ui/` and
`src/components/media/`.

## Principles

1. **Readable in sunlight.** Dark ink on stone paper, 2 px borders on inputs,
   bold labels. Text is never lighter than `muted` (4.5:1 everywhere).
2. **Honest.** A claim looks like a claim. Status is always an icon plus
   words; colour alone never carries meaning. Nothing says "resolved".
3. **Calm, not corporate.** One dark colour for buttons, earth tones for
   accents, flat cards with hairlines, fully round buttons. No gradients, no
   glass, no shadows on cards.
4. **Room for other languages.** isiZulu, Sesotho and Afrikaans run up to 30 %
   longer. Nothing has a fixed width; labels wrap; pills truncate last.
5. **One thumb.** Targets are 44 px or taller (48 px by default), the main
   action sits in the bottom bar, sheets rise from the bottom.

## Colour

| Token                          | Light     | Dark      | Use                                                        |
| ------------------------------ | --------- | --------- | ---------------------------------------------------------- |
| `canvas`                       | `#f3f1ec` | `#17120e` | The page                                                   |
| `surface`                      | `#ffffff` | `#211a14` | Cards, header, inputs                                      |
| `sunken`                       | `#eae4d8` | `#100c09` | Wells, skeletons, disabled inputs                          |
| `ink`                          | `#231a13` | `#f3ece0` | Text                                                       |
| `muted`                        | `#62584e` | `#c4b9a9` | Secondary text                                             |
| `faint`                        | `#766b5f` | `#a69b8b` | Placeholders, timestamps (still 4.5:1)                     |
| `line` / `line-strong`         |           |           | Dividers / input borders                                   |
| `brand` / `-strong` / `-soft`  | `#2f231a` | `#e9dcc6` | Dark umber: primary buttons, links, active nav, focus ring |
| `earth` / `-strong` / `-soft`  | `#7a4b24` | `#e0a877` | People: role badges, endorsements, pattern dividers        |
| `accent` / `-strong` / `-soft` | `#7a4e0c` | `#e6b566` | Attention: warnings, "being addressed"                     |
| `sun` / `sun-soft`             | `#d4af78` | `#c9a064` | Sand: the logo's eye brick, highlights. Never for text     |
| `danger` / `-strong` / `-soft` | `#9b2f1f` | `#ff9d8f` | Errors, disputes, destructive buttons                      |
| `on-brand`                     | `#f6efe4` | `#231a13` | Text on brand, earth, accent and danger fills              |
| `st-reported` … `st-declined`  |           |           | One strong + one soft per status (see StatusPill)          |

Dark mode is automatic (`prefers-color-scheme`) and overrides the same token
names, so no component knows which mode it is in. Set `data-theme="light"` on
`<html>` to force light. `scripts/design/contrast.mts` checks every allowed
text/background pair in both modes; run `pnpm design:contrast` after changing
a value. The current result is at the end of this file.

Tailwind 4 emits a token only when a class uses it, and the Turbopack dev
server keeps the set of classes it has seen. After merging a branch that adds
tokens or components, restart `next dev` (delete `.next` if a class such as
`text-on-brand` still has no rule) before trusting a contrast check or axe run
on that server. `src/app/tokens.test.ts` fails `pnpm check` when a class points
at a token that globals.css does not define.

Rules of thumb:

- Text on `canvas`, `surface`, `sunken`, `sun-soft` and any `-soft` tint:
  `ink`, `muted`, or the matching strong tone (`brand-strong` on `brand-soft`).
- Text on a `brand`, `earth`, `accent` or `danger` fill: `on-brand`.
- `sun` is a fill and a border, never a text colour.

## Type

| Role    | Face                               | Token          |
| ------- | ---------------------------------- | -------------- |
| Body    | Hanken Grotesk (variable)          | `font-sans`    |
| Display | Bricolage Grotesque (optical size) | `font-display` |
| Code    | Geist Mono                         | `font-mono`    |

Fonts load through `next/font` with `display: swap`; the system face shows
first on slow data. `h1`–`h3` take the display face automatically. The scale is
fluid: `text-sm` through `text-6xl` are `clamp()` values that grow with the
viewport. The root is 17 px, so `text-base` is 17 px on a phone and body text
never drops under 16 px. Line height 1.55 for reading, 1.15 for headings.

## Space, shape, depth

- Spacing uses Tailwind's 4 px scale. Page gutter 16 px on phones, 24 px from
  `sm`. Cards pad 20/24 px. Sections breathe 32–40 px.
- Radius: `rounded-xl` (18 px) for controls and inputs, `rounded-2xl` (24 px)
  for cards, `rounded-3xl` (32 px) for sheets and heroes, `rounded-full` for
  pills, avatars and the bottom-bar icon.
- Shadows: `shadow-card` for resting cards, `shadow-raised` for dialogs and
  toasts, `shadow-sheet` for the bottom bar and sheets. Nothing else.
- Phone bottom bar: `--spacing-bottom-bar` (56 px) plus the device safe area.
  Use the `bottom-bar-pad` utility on anything that must clear it.

## Focus and motion

Every focusable element shows a 3 px `brand` outline with a 2 px offset
(`:focus-visible`). On a brand/earth/danger fill the ring turns to `ink` so it
stays visible. Never remove an outline; add `focus-visible:` styles on top if
a control needs more.

Motion is short (≤ 300 ms) and only for entering (toasts, sheets) and progress
(ring, shimmer). `prefers-reduced-motion: reduce` zeroes every animation and
transition globally; components use `motion-safe:` for anything animated.

## Page shell

Every page under the landing page is drawn with `<PageShell>`
(`ui/page.tsx`, styles in `ui/page-shell.css`), in the landing page's own
language (`src/features/landing/vellure/vellure.css`):

- a navy band, shorter than the landing hero, with a small label chip, the
  page's one `h1`, a sentence, and the page's main control where it has one
  (the search on `/issues` and `/schools`, the reference field on `/track`);
- the landing page's top bar over it, solid once the page is scrolled;
- one content width, 1120 px (`page-wrap`); a form or a reading page centres a
  720 px column inside it (`width="narrow"`, `page-narrow`);
- the landing page's footer.

`/sign-in` has no band: its top bar is solid and the page is two panels.
A page that loads its title uses `<PageLoading>` meanwhile, so the band keeps
its height. The earlier geometric pattern (`<Pattern>`) is no longer used; its
tile stays at `public/pattern/bona-pattern.svg`.

Cards are white with a hairline and a soft shadow (`shadow-card`). A message
on the page (`Notice`, `Alert`, a toast) is a white card whose tone is carried
by a small icon tile: no large tinted areas, no dashed boxes, no coloured
edge.

## Components

| Component                                                         | File                                   | Notes                                                                 |
| ----------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `Button`, `ButtonLink`, `IconButton`                              | `ui/button.tsx`                        | `primary`/`secondary`/`quiet`/`danger`; `sm`/`md`/`lg`; `loading`     |
| `Card`, `Badge`                                                   | `ui/card.tsx`                          |                                                                       |
| `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `describedBy` | `ui/field.tsx`                         | Label, hint, `required`/`optional` mark, live error                   |
| `StatusPill`, `STATUS_TONE`                                       | `ui/status-pill.tsx`                   | Icon + words from `src/i18n`; `meaning` adds the one-line explanation |
| `Alert`                                                           | `ui/alert.tsx`                         | On-page message; `live` for errors after an action                    |
| `toast()`, `ToastRegion`                                          | `ui/toast.tsx`                         | Passing message; the region is mounted once in the layout             |
| `Stepper`                                                         | `ui/stepper.tsx`                       | Labels always visible; `aria-current="step"`                          |
| `EmptyState`                                                      | `ui/empty-state.tsx`                   | Soft grey card, photo or icon, one action                             |
| `Skeleton`, `SkeletonGroup`, `SkeletonCard`                       | `ui/skeleton.tsx`                      | Group announces "Loading…" once                                       |
| `Dialog`, `BottomSheet`                                           | `ui/dialog.tsx`, `ui/bottom-sheet.tsx` | Native `<dialog>`; sheet on phones                                    |
| `Avatar`                                                          | `ui/avatar.tsx`                        | Initials; decorative beside a name                                    |
| `ProgressRing`                                                    | `ui/progress-ring.tsx`                 | `role="progressbar"` with a label                                     |
| `Photo`, `PhotoPlaceholder`                                       | `media/photo.tsx`                      | See `docs/design/IMAGES.md`                                           |
| `Logo`, `SiteHeader`, `BottomNav`, `SiteFooter`, `SchoolContext`  | `chrome.tsx`                           | Render `<SchoolContext id name>` inside a school page                 |

Every component is keyboard-operable and labelled. If you build a new one,
add it to `e2e/a11y.spec.ts` coverage by using it on one of the four checked
pages, and run `pnpm lint` (jsx-a11y is on as errors for this layer).

## Writing

Short sentences. Plain South African English. "Toilets", not "ablution
facilities". Say who did what: "The school says it is fixed. An independent
reviewer has not checked it yet." No lorem ipsum, ever: write the real words
or leave the space empty.

## Contrast check

Output of `pnpm design:contrast --md` on the current tokens:

| Mode  | Text            | Background         | Ratio | Needs | Used for                                |
| ----- | --------------- | ------------------ | ----: | ----: | --------------------------------------- |
| light | `ink`           | `canvas`           | 15.14 |   4.5 | body text on the page                   |
| light | `ink`           | `surface`          | 17.09 |   4.5 | body text on a card                     |
| light | `ink`           | `sunken`           | 13.50 |   4.5 | body text on a sunken panel             |
| light | `muted`         | `canvas`           |  6.15 |   4.5 | secondary text on the page              |
| light | `muted`         | `surface`          |  6.94 |   4.5 | secondary text on a card                |
| light | `muted`         | `sunken`           |  5.48 |   4.5 | secondary text on a sunken panel        |
| light | `faint`         | `surface`          |  5.20 |   4.5 | placeholder and timestamps              |
| light | `line-strong`   | `surface`          |  3.73 |     3 | input borders and dividers              |
| light | `brand`         | `canvas`           | 13.52 |   4.5 | brand text on the page                  |
| light | `brand-strong`  | `surface`          | 18.17 |   4.5 | links and quiet buttons                 |
| light | `brand-strong`  | `brand-soft`       | 14.35 |   4.5 | text inside a brand-soft chip           |
| light | `on-brand`      | `brand`            | 13.36 |   4.5 | primary button label                    |
| light | `on-brand`      | `brand-strong`     | 15.91 |   4.5 | primary button label, hovered           |
| light | `earth`         | `surface`          |  7.34 |   4.5 | earth text on a card                    |
| light | `earth-strong`  | `earth-soft`       |  8.31 |   4.5 | role badge                              |
| light | `on-brand`      | `earth`            |  6.43 |   4.5 | label on an earth fill (avatar)         |
| light | `accent`        | `surface`          |  7.19 |   4.5 | accent text on a card                   |
| light | `accent-strong` | `accent-soft`      |  7.98 |   4.5 | text inside an accent-soft chip         |
| light | `on-brand`      | `accent`           |  6.29 |   4.5 | label on an accent fill (avatar)        |
| light | `danger`        | `surface`          |  7.45 |   4.5 | error text                              |
| light | `danger`        | `danger-soft`      |  5.93 |   4.5 | text inside a danger alert              |
| light | `on-brand`      | `danger`           |  6.52 |   4.5 | danger button label                     |
| light | `ink`           | `sun-soft`         | 14.55 |   4.5 | empty-state text on the sunlight tint   |
| light | `muted`         | `sun-soft`         |  5.91 |   4.5 | empty-state secondary text              |
| light | `canvas`        | `ink`              | 15.14 |   4.5 | preview banner                          |
| light | `st-reported`   | `st-reported-soft` |  7.45 |   4.5 | status pill: reported                   |
| light | `st-assess`     | `st-assess-soft`   |  6.25 |   4.5 | status pill: under assessment           |
| light | `st-address`    | `st-address-soft`  |  5.72 |   4.5 | status pill: being addressed            |
| light | `st-claimed`    | `st-claimed-soft`  |  6.52 |   4.5 | status pill: repair claimed             |
| light | `st-verified`   | `st-verified-soft` |  6.70 |   4.5 | status pill: independently verified     |
| light | `st-disputed`   | `st-disputed-soft` |  5.93 |   4.5 | status pill: disputed                   |
| light | `st-declined`   | `st-declined-soft` |  8.03 |   4.5 | status pill: declined                   |
| light | `st-reported`   | `surface`          |  9.37 |   4.5 | status text on a card: reported         |
| light | `st-assess`     | `surface`          |  7.76 |   4.5 | status text on a card: under assessment |
| light | `st-address`    | `surface`          |  7.19 |   4.5 | status text on a card: being addressed  |
| light | `st-claimed`    | `surface`          |  8.22 |   4.5 | status text on a card: repair claimed   |
| light | `st-verified`   | `surface`          |  8.61 |   4.5 | status text on a card: verified         |
| light | `st-disputed`   | `surface`          |  7.45 |   4.5 | status text on a card: disputed         |
| light | `st-declined`   | `surface`          | 10.05 |   4.5 | status text on a card: declined         |
| light | `brand`         | `surface`          | 15.26 |     3 | focus ring on a card                    |
| light | `brand`         | `canvas`           | 13.52 |     3 | focus ring on the page                  |
| dark  | `ink`           | `canvas`           | 15.84 |   4.5 | body text on the page                   |
| dark  | `ink`           | `surface`          | 14.63 |   4.5 | body text on a card                     |
| dark  | `ink`           | `sunken`           | 16.58 |   4.5 | body text on a sunken panel             |
| dark  | `muted`         | `canvas`           |  9.62 |   4.5 | secondary text on the page              |
| dark  | `muted`         | `surface`          |  8.88 |   4.5 | secondary text on a card                |
| dark  | `muted`         | `sunken`           | 10.07 |   4.5 | secondary text on a sunken panel        |
| dark  | `faint`         | `surface`          |  6.28 |   4.5 | placeholder and timestamps              |
| dark  | `line-strong`   | `surface`          |  3.61 |     3 | input borders and dividers              |
| dark  | `brand`         | `canvas`           | 13.74 |   4.5 | brand text on the page                  |
| dark  | `brand-strong`  | `surface`          | 14.90 |   4.5 | links and quiet buttons                 |
| dark  | `brand-strong`  | `brand-soft`       | 13.03 |   4.5 | text inside a brand-soft chip           |
| dark  | `on-brand`      | `brand`            | 12.63 |   4.5 | primary button label                    |
| dark  | `on-brand`      | `brand-strong`     | 14.82 |   4.5 | primary button label, hovered           |
| dark  | `earth`         | `surface`          |  8.21 |   4.5 | earth text on a card                    |
| dark  | `earth-strong`  | `earth-soft`       |  9.04 |   4.5 | role badge                              |
| dark  | `on-brand`      | `earth`            |  8.17 |   4.5 | label on an earth fill (avatar)         |
| dark  | `accent`        | `surface`          |  9.13 |   4.5 | accent text on a card                   |
| dark  | `accent-strong` | `accent-soft`      |  9.65 |   4.5 | text inside an accent-soft chip         |
| dark  | `on-brand`      | `accent`           |  9.09 |   4.5 | label on an accent fill (avatar)        |
| dark  | `danger`        | `surface`          |  8.57 |   4.5 | error text                              |
| dark  | `danger`        | `danger-soft`      |  7.73 |   4.5 | text inside a danger alert              |
| dark  | `on-brand`      | `danger`           |  8.52 |   4.5 | danger button label                     |
| dark  | `ink`           | `sun-soft`         | 13.02 |   4.5 | empty-state text on the sunlight tint   |
| dark  | `muted`         | `sun-soft`         |  7.91 |   4.5 | empty-state secondary text              |
| dark  | `canvas`        | `ink`              | 15.84 |   4.5 | preview banner                          |
| dark  | `st-reported`   | `st-reported-soft` |  8.36 |   4.5 | status pill: reported                   |
| dark  | `st-assess`     | `st-assess-soft`   |  8.02 |   4.5 | status pill: under assessment           |
| dark  | `st-address`    | `st-address-soft`  |  7.77 |   4.5 | status pill: being addressed            |
| dark  | `st-claimed`    | `st-claimed-soft`  |  8.28 |   4.5 | status pill: repair claimed             |
| dark  | `st-verified`   | `st-verified-soft` |  8.18 |   4.5 | status pill: independently verified     |
| dark  | `st-disputed`   | `st-disputed-soft` |  7.73 |   4.5 | status pill: disputed                   |
| dark  | `st-declined`   | `st-declined-soft` |  8.53 |   4.5 | status pill: declined                   |
| dark  | `st-reported`   | `surface`          |  9.81 |   4.5 | status text on a card: reported         |
| dark  | `st-assess`     | `surface`          |  9.40 |   4.5 | status text on a card: under assessment |
| dark  | `st-address`    | `surface`          |  9.13 |   4.5 | status text on a card: being addressed  |
| dark  | `st-claimed`    | `surface`          |  9.46 |   4.5 | status text on a card: repair claimed   |
| dark  | `st-verified`   | `surface`          |  9.57 |   4.5 | status text on a card: verified         |
| dark  | `st-disputed`   | `surface`          |  8.57 |   4.5 | status text on a card: disputed         |
| dark  | `st-declined`   | `surface`          | 10.18 |   4.5 | status text on a card: declined         |
| dark  | `brand`         | `surface`          | 12.69 |     3 | focus ring on a card                    |
| dark  | `brand`         | `canvas`           | 13.74 |     3 | focus ring on the page                  |
