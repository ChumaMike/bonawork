# Simplify sprint — one clear thing per screen

Owner's brief (2026-11-18): the app "looks like a lot all at once", especially for the demo, for
older people and for phone users. Keep the current colours (they match the photos). Be clear who
we are making it for: parents, caregivers, caretakers and school staff on a phone.

The owner chose from a page of options. The mockups (HTML/CSS, phone frames) are in
`docs/design/simplify/screen-options.mockups.html`. Open the `<section id="s-…">` for your screen
and read the option markup: it is the layout and the copy to build. Images in that file are
placeholders (`{{IMAGE_VARS}}`), ignore them.

## Rules for every screen

1. **One main button per screen.** Other actions are quieter (outline, link or behind a row).
2. **The answer first.** The first phone screen (390 × 844) says what is going on without scrolling.
3. **Plain words.** No fingerprints, transaction ids, UUIDs or JSON on a screen by default. They
   live behind "Show proof" / "Technical details".
4. **Touch targets** at least 44 px high; body text stays at the current size (the owner chose
   standard text size).
5. **Current design tokens only** (`src/app/globals.css`): canvas, surface, brand green, earth,
   sun, the status colours. `src/app/tokens.test.ts` fails on an undefined colour class.
6. **Honesty rules still apply.** There is no "resolved" status. A repair is `repair_claimed`
   until an independent reviewer makes it `verified`. Never present a simulated or pending record
   as an Avalanche transaction. Progress notes are "Not on blockchain".
7. Accessibility: real buttons and links, visible focus, labels on every control, `aria-live` for
   results, works at 200% zoom and with reduced motion. `pnpm lint` includes jsx-a11y.

## What the owner picked

| #   | Screen                        | Pick                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Photos everywhere             | Photos **blend into the page**: full width at the top, fading into the canvas colour. No rounded "block of a picture".                                                                                                                                                                                            |
| G2  | Bottom menu                   | **A**: three bigger items — Home, Report, My reports (`/track`). Bona AI moves to the floating Bona buddy.                                                                                                                                                                                                        |
| G3  | Technical proof               | **A**: one word, "Recorded", with a green tick. "Show proof" opens a sheet with the fingerprint, the transaction link and a QR code that opens BonaBlock Verify.                                                                                                                                                  |
| G4  | Text size                     | Standard, as today.                                                                                                                                                                                                                                                                                               |
| 1   | Home                          | **B "Your school first" with pictures** (mix of B and C): blended hero photo, "Which school is it about?", search, then picture tiles for the other things people do.                                                                                                                                             |
| 2   | School page                   | **A**: blended photo, school name, "Report a problem here" button, three numbers, open problems as rows.                                                                                                                                                                                                          |
| 3   | One problem                   | **C**: picture, title, status, three tabs — Summary, Timeline, Proof.                                                                                                                                                                                                                                             |
| 4   | Reporting                     | **A**: one question per screen with big tiles, **plus a floating Bona buddy** that helps at any step.                                                                                                                                                                                                             |
| 5   | After reporting               | **B "ticket to keep"**, and it must **say what happens next** (the three lines from option A).                                                                                                                                                                                                                    |
| 6   | School staff                  | **B list by urgency**; opening a report gives the **guided one-at-a-time answer screen from A**.                                                                                                                                                                                                                  |
| 7   | Reviewer                      | **B three checks first, then A** (before / after, note, two decision buttons).                                                                                                                                                                                                                                    |
| 8   | Check a file (in the app)     | **B "explain as it goes"**, with the codes behind a button.                                                                                                                                                                                                                                                       |
| 9   | BonaBlock Verify (other site) | **A "arrive ready, get one answer"** when opened from the app or a QR code. Opened with nothing: **C** ("scan the code on a BonaBlock record") with **"Paste a receipt instead"** leading to the two-step paste screen from **B**.                                                                                |
| 10  | Bona buddy (new)              | A floating helper button with a face that changes expression. Opens help for the current step, a way to ask Bona AI, and — **only when the person asks for it** — the sign-language concept signer ported from the Gcina project (`web/src/components/sasl-preview.tsx`, three.js, labelled "not real SASL yet"). |

## Work packages and file ownership

Everyone works in this worktree (`BonaBlock-integration`, branch `integration/bona-release`).
Edit only your own files. Do not commit, push or deploy: the coordinator does that.
**Do not run** `pnpm check`, `pnpm build`, `next build`, `next dev`, `pnpm e2e` or `pnpm install`
(the machine has 12 GB and runs one heavy job at a time; the coordinator runs the full gate).
Allowed: `npx eslint <your files>`, `npx vitest run <one test file>`, `pnpm typecheck` at most
twice near the end, `pnpm --filter bona-verify test|typecheck` for the verifier package.

| Package             | Owner       | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 community + base | coordinator | `src/app/**` except `layout.tsx` buddy mount, `src/components/chrome.tsx`, `src/components/media/**`, `src/components/ui/**`, `src/components/{endorse-button,evidence-list,issue-card,ledger-state,receipt-actions,status,timeline,file-picker}.tsx`, `src/components/community/**`, `src/components/proof/**` (new), `src/features/{landing,schools,issues,report,track,verify,auth}/**`, i18n sections other than those below, `e2e/journeys.spec.ts`, `e2e/screens.spec.ts`, `e2e/a11y.spec.ts`, `e2e/support.ts`. |
| W2 staff            | agent       | `src/features/staff/**`, `src/components/staff/**`, i18n sections `admin` and `reviewer`, `e2e/staff.spec.ts`. In `e2e/live/demo.spec.ts` only the two tests named "steps 9–12…" and "steps 13–14…".                                                                                                                                                                                                                                                                                                                   |
| W3 verifier         | agent       | `verifier/**` (the separate BonaBlock Verify app), `src/lib/verify-link.ts` (+ test), `src/components/verify-qr.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| W4 buddy            | agent       | `src/components/buddy/**` (new), a new i18n section `buddy` appended at the end of `src/i18n/en.ts`, and one mount line in `src/app/layout.tsx`.                                                                                                                                                                                                                                                                                                                                                                       |

`package.json` already has `three@0.180.0`, `@types/three` and `qrcode-generator@2.0.4`. Nobody
adds dependencies.

## Contracts between packages

**Verify link (W3 provides, W1 uses in the proof sheet).**

```ts
// src/lib/verify-link.ts
/** URL that opens BonaBlock Verify with this record filled in, or null when the record is not a
 *  confirmed on-chain receipt or NEXT_PUBLIC_VERIFY_URL is not set. The receipt travels in the
 *  URL fragment (after #), so it is never sent to a server. */
export function verifyLink(
  receipt: unknown,
  opts?: { label?: string; reportId?: string },
): string | null;

// src/components/verify-qr.tsx  ("use client")
/** A QR code for `href`, drawn as inline SVG with qrcode-generator. Dark modules use currentColor. */
export function VerifyQr(props: {
  href: string;
  size?: number;
  className?: string;
}): JSX.Element;
```

The verifier reads that fragment on load. A phone's own camera app scanning the QR code opens the
link, so "scan a code" needs no scanner inside the verifier.

**Buddy position (W4 provides, W1 leaves room).** The buddy button is a 52 px circle fixed at the
bottom right, above the bottom menu and above any sticky action bar: `bottom:
calc(var(--spacing-bottom-bar) + 5.25rem)`. It never covers the primary button. W1's sticky action
bars are at most 4.75rem tall.

**Buddy context (W4 provides, anyone may use).** A page can describe its current step so the buddy
gives the right help:

```tsx
import { BuddyHint } from "@/components/buddy/buddy-hint";
<BuddyHint id="report.category" />; // renders nothing; ids map to tips in the i18n `buddy` section
```

W4 defines the ids for the report steps (`report.school`, `report.category`, `report.describe`,
`report.photo`, `report.review`), `receipt`, `issue`, `school`, `home`, `track`, `verify`,
`admin`, `reviewer`, and a fallback.

## Done means

- Your screens match the picked option at 390 px and still work at 768 and 1440.
- Unit tests you own pass; e2e specs you own are updated to the new screens (you cannot run them;
  write them carefully and say what you changed).
- A short report: what you built, files touched, anything you could not finish, and every
  `data-testid`, role/name or text that other packages' tests may depend on and that you changed.
