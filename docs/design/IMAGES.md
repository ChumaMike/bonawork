# Images

Photographs make BonaBlock feel like a real place. Every picture the app can
show has a key in `src/components/media/manifest.ts`, and pages ask for it by
key with `<Photo name="…" />`. Until a file exists for a key, `<Photo>` draws a
placeholder (dominant tone, pattern, icon) in the same box, so no page waits
for photography.

## The flow

1. Generate or shoot the picture following the shot list in
   `docs/coordination/UI_SPRINT.md` (South African public school, warm light,
   no readable text, no logos, no close-up faces of children).
2. Save it as `<key>.jpg` (or `.png`, `.webp`) into `public/images/raw/`, where
   `<key>` is one of the keys below. The raw folder is ignored by git.
3. Run the optimiser:

   ```bash
   pnpm images              # all raw files
   pnpm images hero_home    # one key
   ```

   It writes, per key, into `public/images/`:
   - `<key>-480.webp`, `<key>-960.webp`, `<key>-1600.webp` (never enlarged)
   - `<key>.jpg` at up to 1600 px wide, progressive, quality 82

   and rewrites `src/components/media/generated.ts` with the file, measured
   size, dominant colour and the variant widths. Metadata (EXIF, location) is
   stripped; the picture is rotated upright first.

4. Commit `public/images/*.webp`, `public/images/*.jpg` and `generated.ts`
   together as one commit ("media: add hero and category photos").

`<Photo>` passes the JPEG to `next/image`, which serves resized WebP/AVIF on
the fly with the `sizes` you give. The `-480/-960/-1600.webp` variants are for
anything outside Next (the verifier app, emails, the README).

## Keys

| Key                           | Where it is used                            |
| ----------------------------- | ------------------------------------------- |
| `hero_home`                   | Home hero, above the fold (`priority`)      |
| `hero_school`                 | School page header                          |
| `category_water`              | Category chip and empty state for water     |
| `category_sanitation`         | … toilets and sanitation                    |
| `category_electricity`        | … electricity                               |
| `category_buildings`          | … roofs and buildings                       |
| `category_safety`             | … safety and fencing                        |
| `category_learning_resources` | … classrooms and learning resources         |
| `category_other`              | … something else                            |
| `community_meeting`           | Issues list header, endorsement explanation |
| `reviewer_inspecting`         | Reviewer dashboard, sign-in role card       |
| `admin_desk`                  | Admin dashboard, sign-in role card          |
| `verify_phone`                | Verify page and BonaBlock Verify            |
| `evidence_capture`            | Report flow "Show us" step, evidence page   |
| `empty_state`                 | `<EmptyState photo="empty_state">`, 1:1     |

Alt text lives in `PHOTO_META` in the manifest. Write what the picture shows
("A single outdoor school tap on a concrete block with a bucket under it"),
not that it is a picture. Pass `alt=""` to `<Photo>` when the same words are
already next to it.

## Using `<Photo>`

```tsx
import { Photo } from "@/components/media/photo";

// Above the fold: eager and preloaded. `sizes` tells the browser how wide it renders.
<Photo name="hero_home" priority sizes="100vw" className="rounded-3xl" />

// In a two-column grid on desktop, full width on phones (the default `sizes`).
<Photo name="category_water" className="rounded-xl" />

// A small round thumbnail; the box can be any shape, the picture covers it.
<Photo name="reviewer_inspecting" sizes="96px" className="size-24 rounded-full" />
```

`hasPhoto(name)` tells you whether the real file exists, for a layout that
should change when it does (for example, hide a decorative strip until then).

## Rules

- Keep raw files under 12 MB and at least 1200 px wide; 1536 × 1024 is ideal.
- Demo pictures stay synthetic: no real school names, signage or people who
  could be identified.
- Do not hand-edit `generated.ts`; run the optimiser again instead.
- A page must look right with the placeholder: the dominant colour and ratio
  in `PHOTO_META` are what the placeholder uses, so keep them honest.
