# Design hand-off

Branch `design/brand`, worktree `BonaChain-design`. Newest entry first. The coordinator merges;
nothing here has been pushed, merged or deployed.

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

**The coordinator must decide** (details under "Open points" in the spec):

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

**Waiting on the owner**: the pick. The final logo files, `<BrandLogo>`, the icons, the
manifest name and `docs/design/BRAND.md` follow once it is made.

**Checks**: `pnpm check` passed on this branch after merging `main` at `bb4d46c`.
