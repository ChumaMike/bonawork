# Bona Chain brand

The logo, its colours and how to use them. The interface itself (tokens, components, type,
motion) is in `DESIGN_LANGUAGE.md`; the screens are in `BONA_CHAIN_SCREENS.md`.

Names: **Bona Chain** (the product, always two words), **Bona AI** (the assistant),
**Bona Chain Verify** (the verifier), **Bolt** (the robot helper). The earlier name BonaBlock
is not used anywhere new.

## The logo

**Seeing links.** Two chain links, and an eye where they join. "Bona" means "see": the chain
is what watches each step of a repair. The eye is carried over from the brick logo of
BonaBlock, so the product has grown rather than changed.

The owner picked it on 20 November 2026 from four options
(`docs/design/brand/logo-options.html`).

The mark is three shapes on a 40 x 40 grid: two rings (radius 11.5, line 3.5, centres 10
apart) and a dot (radius 3.1) at the centre. The name is set in Bricolage Grotesque Bold with
tight spacing, "Bona" in ink and "Chain" in the accent colour.

### Files

| File                                    | Use it for                                                         |
| --------------------------------------- | ------------------------------------------------------------------ |
| `public/brand/bona-chain-logo.svg`      | Mark and name on a light background: slides, documents, README     |
| `public/brand/bona-chain-logo-dark.svg` | Mark and name on a dark background or over a dark photo            |
| `public/brand/bona-chain-mark.svg`      | The mark alone, in colour                                          |
| `public/brand/bona-chain-mark-mono.svg` | The mark alone in one colour (it takes the text colour)            |
| `public/icon.svg`                       | Browser tab and app icon: cream mark on an umber tile              |
| `public/icon-maskable.svg`              | Android adaptive icon: the same, full bleed, mark in the safe zone |

In the logo files the name is drawn as outlines, so they look the same on a machine without
the font. All six are built by one script from the same shapes:

```bash
node docs/design/brand/build-logo.mjs rings
```

Change the shapes there, never in the files by hand.

### In the app

```tsx
import { BrandLogo, BrandMark } from "@/components/brand/brand-logo";

<BrandLogo />                    // mark and name, header size
<BrandLogo size="sm" />          // phone header
<BrandLogo size="lg" />          // landing page, sign-in page
<BrandLogo tone="mono" />        // everything in the current text colour
<BrandMark title="Bona Chain" /> // the mark alone, named for screen readers
```

`BrandLogo` uses the colour tokens (`brand`, `ink`, `earth`), so it follows light and dark
mode by itself. It is not a link; wrap it in one where it should lead home. Next to the name
the mark is decorative and hidden from screen readers, so the name is read once.

### Sizes

- Smallest mark: 24 px in the tile icon, 20 px on its own. Under that the eye closes up.
- Smallest logo with the name: 96 px wide.
- At 16 px (a browser tab on a low-density screen) only the tile icon is used. It reads as
  two rings; that is acceptable there and nowhere else.

### Clear space

Keep a margin around the logo equal to the radius of one ring (a little over a quarter of
the mark's height) on every side. Nothing else sits inside it: no text, no edge of a photo,
no other logo.

## Colours

The brand palette, measured from the product's photographs: brick, khaki, dust and shade.

| Name  | Value     | Use                                                 | Nearest interface token |
| ----- | --------- | --------------------------------------------------- | ----------------------- |
| Ink   | `#2B2118` | The mark, the name, text, the icon tile             | `brand` / `ink`         |
| Cream | `#F6F0E4` | Page and slide backgrounds; the logo on dark        | `canvas` / `on-brand`   |
| Sand  | `#EADFC8` | Panels and quiet fills                              | `sunken`                |
| Rust  | `#8C4F24` | The eye and "Chain" on light backgrounds; accents   | `earth`                 |
| Khaki | `#B08A55` | Lines, pattern, large shapes. Not for text on light | `line-strong` (role)    |
| Sun   | `#D4AF78` | The eye and "Chain" on dark backgrounds; highlights | `sun`                   |

Contrast, measured (WCAG AA needs 4.5 for text, 3 for large text and shapes):

| Foreground | Background | Ratio | Passes for      |
| ---------- | ---------- | ----: | --------------- |
| Ink        | Cream      | 13.88 | all text        |
| Ink        | Sand       | 11.91 | all text        |
| Rust       | Cream      |  5.68 | all text        |
| Rust       | Sand       |  4.88 | all text        |
| Cream      | Ink        | 13.88 | all text        |
| Sun        | Ink        |  7.65 | all text        |
| Khaki      | Ink        |  4.96 | all text        |
| Khaki      | Cream      |  2.80 | decoration only |
| Sun        | Cream      |  1.81 | decoration only |
| Rust       | Ink        |  2.44 | never together  |

So: rust is the accent on light, sun is the accent on dark, and the two never swap.

## Type

Bricolage Grotesque for the name and headings, Hanken Grotesk for reading, Geist Mono for
fingerprints and codes. See `DESIGN_LANGUAGE.md`.

## Do

- Use the files as they are. Scale them; do not redraw them.
- Put the light logo on cream, sand or white, and the dark logo on ink or a dark photo.
- Use the one-colour mark when only one colour is available: a stamp, an engraving, a
  single-colour print.
- Write the name as two words with two capitals: Bona Chain.

## Don't

- Don't stretch, rotate, outline or add a shadow to the logo.
- Don't recolour it outside the palette, and don't put rust on ink or sun on cream.
- Don't place it on a busy part of a photograph. Find a calm area or use a solid panel.
- Don't write "BonaChain", "Bonachain", "BONA CHAIN" in running text, or "BonaBlock".
- Don't use the mark as a status icon in the interface. A tick, a clock and an alert mean
  done, waiting and blocked; the mark means the product.
- Don't draw a new mascot. Bolt is the helper.
- Don't pair the logo with words that suggest real payments or that AI approves anything.
  Bona Chain runs on a test network, moves no money, and its AI only explains.
