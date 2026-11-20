# Design hand-off

Branch `design/brand`, worktree `BonaChain-design`. Newest entry first. The coordinator merges;
nothing here has been pushed, merged or deployed.

## 3. The logo (deliverable A, second half)

The owner picked **Seeing links** on 20 November (option 1 on the options page; the pick is
also stored in that page's database as `logo: "rings"`, with no change notes).

**What changed**

- `public/brand/bona-chain-mark.svg`, `bona-chain-mark-mono.svg`, `bona-chain-logo.svg`,
  `bona-chain-logo-dark.svg`: new.
- `public/icon.svg`, `public/icon-maskable.svg`: the brick icon is replaced by the new mark.
- `public/manifest.webmanifest`: `name` and `short_name` are now "Bona Chain". Nothing else
  in it changed (the description still needs builder C's wording).
- `src/components/brand/brand-logo.tsx`: `<BrandLogo>` and `<BrandMark>`, with
  `brand-logo.test.tsx` (6 tests).
- `docs/design/BRAND.md`: logo, files, sizes, clear space, colours with measured contrast,
  do and don't.
- `docs/design/brand/build-logo.mjs`: the mark sits larger in the icon tile for this pick.

**Not done yet, on purpose**: the header, sign-in page, landing page and the verifier still
show the old brick logo and the name "BonaBlock". `src/components/chrome.tsx` belongs to
builder B and the verifier to builder E until the polish pass, so I have not edited them.
Swapping `Logo` in `chrome.tsx` to `<BrandLogo>` is a three-line change; either builder B
does it now or I do it in the polish pass.

**For the coordinator**

- Safe to merge now: nothing outside the design-owned paths was touched.
- After the merge the browser-tab icon and the installed-app name change at once. The header
  logo does not, until `chrome.tsx` uses `<BrandLogo>`.
- The verifier app has its own icon and header logo; they are not covered by this commit.

**Checks**: `pnpm check` passed with these changes, and again after merging `main` at
`0195d47` (178 app tests, 99 verifier tests).

## 2. Screen specification and core-flow mock-up (deliverable B)

**What changed**

- `docs/design/BONA_CHAIN_SCREENS.md`: the home screen, the one main action, the empty state,
  the success state and the exact button words for each of the seven people; the trail
  (public and staff versions, three states per row); the release gate; the blocked-invoice
  result; the sign-in role cards; status wording.
- `docs/design/mockups/core-flow.html`: a clickable mock-up of the six demo moments. Published
  for the owner at <https://claude.ai/artifact/NoyCmnCieApBVs2ByoyBtN> (private to the owner
  until they share it). The file also opens straight from disk in a browser.

**Files**: `docs/design/BONA_CHAIN_SCREENS.md`, `docs/design/mockups/core-flow.html`.
No code, type, route or wording file was touched.

**For the frontend builder (B)**: build the trail, the gate and the blocked-invoice result
from the spec. Every sentence the screens need is written out there; they belong in
`src/i18n/en-procurement.ts`, which is still empty.

**Decided by the coordinator on 20 November**: all three points below were accepted and passed
to builders A, B and C. Where the build brief and the spec differ, the brief wins on behaviour
and the spec wins on wording and layout.

**The three points** (details under "Open points" in the spec):

1. `PublicTrailStep` has no machine-readable outcome for `match_recorded`, so the public trail
   cannot show a blocked invoice without comparing `note` text. Suggested: an optional
   `outcome: "matched" | "blocked"` on the public step. It is neither an amount nor a name.
2. Wording in `src/i18n/en.ts` (builder C): the `system` actor still reads "BonaBlock" and
   should read "Bona Chain rules"; "Goods receipt recorded" should read "Delivery recorded";
   "Three-way match recorded" should read "Invoice checked against order and delivery";
   `openInVerify` and `openVerify` still say "BonaBlock Verify".
3. `ruleExplanation` in `src/shared/procurement/explain.ts` (builder A) should use the same
   reason sentences as the table in the spec, so the list and the explanation never disagree.

## 1. Logo options (deliverable A, first half)

**What changed**

- `docs/design/brand/logo-options.html`: four logo options (Seeing links, Link and tick,
  Trail to tick, bc links), each shown alone in one colour, with the name, at browser-tab
  size, on dark and in the app header. Published for the owner at
  <https://claude.ai/artifact/KBrAqoD794zvefGbin2UYK>. The pick is stored in that page's
  database: collection `picks`, document `main`, fields `logo` (`rings`, `link`, `trail` or
  `bc`), `note`, `updatedAt`.

- `docs/design/brand/build-logo.mjs`: builds the logo files for the picked mark
  (`node docs/design/brand/build-logo.mjs <rings|link|trail|bc>`). It writes the mark, the
  light and dark logo, `public/icon.svg` and `public/icon-maskable.svg`. The name is drawn as
  outlines, so the files need no font. It has been run for all four marks into a temporary
  folder and checked by eye; it has not been run into `public/` yet.

**Waiting on the owner**: the pick. The final logo files, `<BrandLogo>`, the icons, the
manifest name and `docs/design/BRAND.md` follow once it is made.

**Checks**: `pnpm check` passed on this branch after merging `main` at `bb4d46c`.
