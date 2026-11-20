# Bona Chain screens

What each person sees, the one thing they do there, and the exact words. Written for the
builders of `src/features/procurement/**`, the role homes and the public case page.

It builds on `DESIGN_LANGUAGE.md` (tokens, components, focus, motion) and on the shapes in
`src/shared/procurement/types.ts`. Nothing here needs a new type, route or rule, except the
three points listed under [Open points](#open-points).

A clickable mock-up of the core flow is published at
<https://claude.ai/artifact/NoyCmnCieApBVs2ByoyBtN> (source: `docs/design/mockups/core-flow.html`).
The link is private to the owner until they share it; the source file opens in any browser.

## Rules for every screen

1. **One main action.** One filled (`primary`) button per screen. Anything else is
   `secondary` or `quiet`. If a person has nothing to do, there is no primary button.
2. **Say who it is waiting for.** A screen never just says "pending". It says
   "Waiting for the supplier" or "Waiting for the independent reviewer".
3. **Words a parent can read.** Short sentences. "Delivery", not "goods receipt", in running
   text. "The invoice does not match the order", not "three-way match failed".
4. **Never write** "paid", "payment made", "resolved", "approved by AI", "transaction" for a
   simulated record, or "mainnet". Write "Release authorised", "Repair claimed", "Verified",
   "simulated record", "Avalanche Fuji test network".
5. **Status is an icon plus words.** Colour never carries the meaning alone.
6. **Phone first.** Every layout works at 390 px. Targets are 44 px or taller. Tables with
   prices scroll inside their own box; the page never scrolls sideways.
7. **Testnet notice.** Every signed-in procurement screen ends with the line
   "Test network only. No real money moves." in `text-sm text-muted`.

## Status wording

Report status (unchanged, from `en.ts`): Reported · Under assessment · Being addressed ·
Repair claimed · Independently verified (short form: Verified) · Disputed · Declined by school.

Procurement stage (`ProcurementStage`), shown as a pill next to the report status and never
instead of it:

| Stage                   | Pill words           | One-line meaning                                                         | Tone (token pair) |
| ----------------------- | -------------------- | ------------------------------------------------------------------------ | ----------------- |
| `order_approved`        | Order approved       | Waiting for the supplier to acknowledge the order.                       | `st-assess`       |
| `order_acknowledged`    | Order acknowledged   | Waiting for the supplier's invoice and the delivery record.              | `st-assess`       |
| `invoice_blocked`       | Invoice blocked      | The invoice does not match the order or the delivery.                    | `st-disputed`     |
| `invoice_matched`       | Invoice matched      | The invoice matches the order and the delivery.                          | `st-address`      |
| `awaiting_verification` | Waiting for reviewer | The invoice matches. An independent reviewer has not checked the repair. | `st-claimed`      |
| `ready_for_release`     | Ready for release    | Everything is checked. The payment approver can authorise the release.   | `st-address`      |
| `release_authorised`    | Release authorised   | A release instruction was authorised. No money moved.                    | `st-verified`     |

Icons, in the same order: `file`, `check`, `alert`, `check`, `clock`, `lock` (open), `shieldCheck`.

Role labels (from `en.ts`, used on every trail step): Community member · School ·
Programme buyer · Supplier · Receiving officer · Independent reviewer · Payment approver.
The rule engine is labelled **Bona Chain rules**, never a person and never "AI".

## The role home

All six signed-in homes share one layout, so a person who has seen one can use any of them.

```
[ header: logo · workspace link · account ]
h1   workspace title            e.g. "Work orders"
p    one line: what this page is for
---------------------------------------------
NEXT FOR YOU                     (the oldest queue item, as a card)
  reference · school
  problem title
  stage pill · "Waiting since 2 days ago"
  [ primary button ]
---------------------------------------------
Also waiting (3)                 (compact rows; tapping one opens it)
Done recently                    (collapsed list, proof chip per row)
---------------------------------------------
Test network only. No real money moves.
```

- Data: `GET /api/work/queue` (`WorkQueueItem[]`), oldest `since` first.
- The card is a `Card`; the title is an `h2`; the queue rows are a `ul`.
- At 768 px and up the card and the "Also waiting" list sit side by side (2 : 1). At 1440 px
  the content column stays at `max-w-5xl`.
- On a phone, when a task form is open, its primary button sits in a sticky bar at the
  bottom (`bottom-bar-pad`), full width.
- Loading: `SkeletonCard` in the card's place. Error: `Alert` with "Try again".
- After every successful action: a toast with the success sentence, the card changes to its
  done state with a proof chip, and focus moves to the card's heading.

## The seven people

### 1. Public: learners and parents (signed out)

| Screen           | Layout                                                                                     | Main button          |
| ---------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| Landing `/`      | Hero sentence, the two actions, then one finished case shown as the public trail (Case B). | **Report a problem** |
| Report `/report` | The existing guided steps.                                                                 | **Send my report**   |
| Follow `/track`  | One field for the reference, then the case with its public trail.                          | **Follow this case** |

- Second action on the landing page (`secondary`): "Follow a case".
- Empty state (follow, nothing typed): "Type the reference from your report slip, for example
  BB-2026-000123."
- Empty state (case with no work order yet): the trail shows "Problem reported" as done and
  step 1 as waiting: "Waiting for the programme buyer to approve a work order."
- Success state (report sent): "Your report is recorded. Keep this reference: BB-2026-000123."
  with the button "Follow this case".
- The public never sees amounts, supplier names, documents or people's names. Only the step,
  the role label, the time and the proof.

### 2. School administrator `/admin`

- Layout: the role home. Queue = new reports, then repairs to claim.
- Main action, per item: **Acknowledge report**, later **Claim the repair** (opens the
  existing guided claim; its last button stays "Submit repair claim").
- Empty state: "Nothing is waiting for you. New reports from your school appear here."
- Success states: "Report acknowledged. The reporter can see that you have seen it." ·
  "Repair claimed. It stays 'Repair claimed' until an independent reviewer checks it."
- On a case the administrator has claimed, the verify area shows the existing refusal:
  "A school cannot verify its own repair." There is no verify button for this role.
- Sees the staff trail with names, scope and quantities. No prices.

### 3. Programme buyer `/buyer`

- Layout: the role home. Queue = acknowledged reports with no work order (`approve_order`).
- Opening an item shows the problem (title, photo, school) and the work order form:
  supplier reference, scope of work, lines (code, description, quantity, unit price) with a
  running total. One line per row on a phone, stacked as label and value.
- Main action: **Approve work order**.
- Empty state: "No problems are waiting for a work order."
- Success state: "Work order approved. The supplier has been asked to acknowledge it."
- Sees everything, with the named person on each step.

### 4. Supplier `/supplier`

- Layout: the role home. Queue = orders to acknowledge, then orders to invoice. Only this
  supplier's orders, with its own prices.
- An order to acknowledge shows scope, lines and total. Main action: **Acknowledge order**.
  Success: "Order acknowledged. You can now send your invoice."
- An order to invoice shows three numbered steps on one page (`Stepper`):
  1. **Paste your invoice.** A `Textarea`. Button (`secondary`): "Read it with Bona AI".
     Under it, a link-style button: "Type the fields myself".
  2. **Check the fields.** Invoice number, lines, total. A banner above the fields:
     "Bona AI filled these in from your text. Check each one. Bona AI does not submit or
     approve anything." Fields Bona AI could not read are empty and marked
     "Not found in your text".
  3. Main action: **Submit invoice**.
- After submitting, the result replaces the form: either
  [Invoice blocked](#the-blocked-invoice-result) or "Invoice matched".
- Empty state: "No orders are waiting for you."
- Success (matched): "Invoice matched. It agrees with the order and the delivery. Next: an
  independent reviewer checks the repair."

### 5. Receiving officer `/receiving`

- Layout: the role home. Queue = acknowledged orders with no delivery record (`record_receipt`).
- An item shows the ordered lines as a checklist: description, "Ordered: 12", and a number
  field "Arrived" that starts empty (never pre-filled with the ordered quantity). Optional
  photos of the delivery (`FilePicker`).
- No prices anywhere on this screen, not even hidden columns.
- Main action: **Record delivery**.
- Empty state: "No deliveries are waiting to be recorded."
- Success state: "Delivery recorded. 12 of 12 taps, 8 of 8 pipes." (one short clause per line,
  at most three, then "and 2 more lines").

### 6. Independent reviewer `/reviewer`

- Layout: the role home. Queue = repair claims to check.
- An item shows the school's claim, the claim photos beside the problem photos, and the
  reviewer's own evidence picker and note.
- Main action: **Verify repair**. Second action (`danger`, outline): **Dispute repair**.
  They sit side by side at 768 px and up, stacked on a phone with Verify first.
- Empty state: "No repair claims are waiting for a review."
- Success states: "Verified. This repair is now 'Independently verified'." ·
  "Disputed. The report shows that the repair was not confirmed."
- Sees names, scope and quantities. No prices.

### 7. Payment approver `/payments`

- Layout: the role home, with [the release gate](#the-release-gate) inside the "Next for you"
  card. Queue = every order that is not yet released, locked ones included, open ones first.
- Main action: **Authorise release**, only when the gate is open.
- Empty state: "No releases are waiting. Orders appear here as soon as a work order is approved."
- Success state: "Release authorised. This is an instruction. No money moved on this test network."

## The trail

The case timeline. One fixed list of eight rows: the report, then the seven steps. The order
of the rows never changes, even when the delivery is recorded before the invoice.

| #     | Row title                                  | Role label           | Waiting sentence                                                     |
| ----- | ------------------------------------------ | -------------------- | -------------------------------------------------------------------- |
| Start | Problem reported                           | Community member     | (always done)                                                        |
| 1     | Work order approved                        | Programme buyer      | Waiting for the programme buyer to approve a work order.             |
| 2     | Supplier acknowledged the order            | Supplier             | Waiting for the supplier to acknowledge the order.                   |
| 3     | Invoice submitted                          | Supplier             | Waiting for the supplier's invoice.                                  |
| 4     | Delivery recorded                          | Receiving officer    | Waiting for the receiving officer to record the delivery.            |
| 5     | Invoice checked against order and delivery | Bona Chain rules     | Checked automatically when the invoice and the delivery are both in. |
| 6     | Repair independently verified              | Independent reviewer | Waiting for the independent reviewer.                                |
| 7     | Release authorised                         | Payment approver     | Locked until the invoice matches and the reviewer has verified.      |

### States

| State       | Marker (28 px circle on the rail)                                                                                  | Text                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Done**    | filled `brand`, `check` icon in `on-brand`                                                                         | title in `ink`, role, time, proof chip                             |
| **Waiting** | 2 px ring. The first waiting row: ring `accent`, `clock` icon, tag "Next". Later rows: ring `line-strong`, no icon | the waiting sentence in `muted`; no time, no proof                 |
| **Blocked** | filled `danger`, `alert` icon in `on-brand`                                                                        | title in `ink`, the blocked sentence in `danger`, time, proof chip |

- Blocked applies to two rows only. Row 5 when the latest match is `blocked`:
  "The invoice does not match. The supplier must send a corrected invoice." Row 6 when the
  report is `disputed`: "The reviewer found the problem is not fixed."
- While a row is blocked, no later row carries the "Next" tag: the blocked row is what must
  be dealt with first.
- Row 5 done: "The invoice matches the order and the delivery."
- Row 7 done: "Release authorised. An instruction, not a payment."
- A row that happened more than once (a blocked invoice, then a corrected one) shows the latest
  result and one extra line: "1 earlier invoice was blocked." In the staff version this line
  opens the earlier attempts.
- Every state has a visually hidden word before the title ("Done:", "Waiting:", "Blocked:")
  so a screen reader hears the state.

### Row anatomy

```
(●)  Work order approved                       <- h3, font-semibold
 |   [Programme buyer]  ·  20 Nov, 09:14       <- Badge + <time>
 |   [ On Avalanche Fuji ✓ ]  Show proof        <- LedgerChip + ProofButton
 |
(◌)  Supplier acknowledged the order   [Next]
 ┆   Waiting for the supplier to acknowledge the order.
```

- Markup: `<ol>`, one `<li>` per row, the row with the "Next" tag carries `aria-current="step"`.
  Grid: a 28 px rail column, 12 px gap, then the content. 20 px between rows on a phone, 24 px
  from 768 px.
- The rail is a 2 px line: solid `brand` between two done rows, dashed `line-strong` below the
  last done row. A blocked row keeps a solid rail above it and a dashed one below.
- The role is a `Badge` in the `earth` tone. The time is a `<time datetime>`: relative when
  under a day old ("2 hours ago"), otherwise "20 Nov, 09:14".
- The proof chip is the existing `LedgerChip` plus `ProofButton` ("Show proof"), from
  `TrailProof`: a `ledger` receipt reads "On Avalanche Fuji"; `simulated` reads
  "Simulated record" and never shows a transaction; `none` reads "Not recorded yet".
- At 1440 px the trail keeps a reading width (`max-w-xl`); it does not stretch.
- Motion: when a row turns done, its marker fills over 200 ms (`motion-safe:` only).

### Public version

Data: `publicTrail` (`PublicTrailStep[]`) plus the report's own timeline for rows Start and 6.

- Shows the title, the role label, the time and the proof chip. Nothing else.
- No amounts, no supplier name, no person's name, no invoice number, no line items.
- The heading above it: "Who did what, and the proof". The line under the heading:
  "Each step is recorded on the Avalanche Fuji test network. Amounts and names are not public."

### Staff version

Data: `MoneyTrail` (`steps`, `order`, `invoices`, `receipts`, `gate`).

- The role badge is joined by the person: "**Naledi Dlamini** · Programme buyer"
  (`actorName`). Row 5 reads "Bona Chain rules" with no name.
- One detail line per row, depending on what the viewer may see (`pricesVisible`):

| Row | With prices (buyer, approver, district, the supplier itself) | Without prices (receiving officer, school, reviewer) |
| --- | ------------------------------------------------------------ | ---------------------------------------------------- |
| 1   | "3 lines · R 9 180.00" and a "See the order" link            | "3 lines · 22 items" and a "See the order" link      |
| 3   | "Invoice INV-0042 · R 9 180.00"                              | "Invoice INV-0042"                                   |
| 4   | "22 of 22 items arrived"                                     | the same                                             |
| 5   | "2 reasons" (opens the blocked-invoice result) or nothing    | the same, without the amounts inside                 |

- When an invoice has `aiDrafted`, row 3 adds: "Fields read by Bona AI, checked by the supplier."
- Amounts use tabular figures and the shared money formatter; right-aligned in tables.
- The heading above it: "The trail for this case".

## The release gate

The payment approver's card. It is a lock with a checklist. Data: `MoneyTrail.gate`, with the
trail itself used to choose the right sentence.

```
( 🔒 )  Release locked
        2 things must happen first.

  ✓  The supplier acknowledged the order.
  !  The invoice does not match the order.
  ◌  Waiting for the independent reviewer.

  [ 🔒 Release locked ]        <- not a working primary button
  Test network only. No real money moves.
```

### The checklist

Three rows, always shown, always in this order. A row is cleared when its blocker code is
absent from `gate.blockers`.

| Blocker code             | Cleared                                         | Blocking                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `order_not_acknowledged` | The supplier acknowledged the order.            | Waiting for the supplier to acknowledge the order.                                                                                                                                         |
| `no_matching_invoice`    | The invoice matches the order and the delivery. | No invoice yet: "Waiting for the supplier's invoice." · Latest match blocked: "The invoice does not match the order." · Invoice in, no delivery record: "Waiting for the delivery record." |
| `repair_not_verified`    | An independent reviewer verified the repair.    | `repair_claimed`: "Waiting for the independent reviewer." · `disputed`: "The reviewer found the problem is not fixed." · earlier: "The school has not claimed the repair yet."             |

Two more blockers appear as their own row only when present:

- `same_person`: "You already acted on this case in another role. A different payment
  approver must authorise the release."
- `already_released`: not a locked state. The card shows the done state below.

Row icons: cleared = `check` in `st-verified`; blocking because something is wrong
(does not match, disputed, same person) = `alert` in `danger`; blocking because someone has
not acted yet = `clock` in `accent`. Each row starts with a hidden word: "Done:", "Problem:"
or "Waiting:".

### The three states

| State      | Lock                                         | Title              | Under the title                                              | Button                                                                        |
| ---------- | -------------------------------------------- | ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Locked     | closed `lock`, 48 px circle, `sunken` ground | Release locked     | "1 thing must happen first." / "2 things must happen first." | "Release locked", `aria-disabled="true"`, `secondary` look with the lock icon |
| Open       | open lock, `st-verified-soft` ground         | Ready to authorise | "Everything is checked."                                     | **Authorise release** (`primary`)                                             |
| Authorised | `shieldCheck`, `st-verified-soft` ground     | Release authorised | "Authorised by you on 21 Nov, 10:42." + proof chip           | none                                                                          |

- The locked button stays focusable. Pressing it calls nothing: it moves focus to the first
  blocking row and a live region says "Release is locked. 2 things must happen first."
- Pressing **Authorise release** opens a confirmation (`Dialog`, a `BottomSheet` on phones):
  title "Authorise the release for BB-2026-000131?", body "This records a release instruction
  on the Avalanche Fuji test network. No money moves.", buttons **Authorise release** and
  "Cancel".
- If the server answers 409, the card goes back to Locked with the blockers it returned, and
  an `Alert` says "The release could not be authorised. Something changed on this case."
- When the gate opens while the page is open, a live region says "The release can now be
  authorised." The lock opens over 200 ms (`motion-safe:` only).
- The card never shows an amount in its title or button. The order total is in the trail
  below, for this role.

## The blocked-invoice result

Shown to the supplier straight after **Submit invoice**, and to staff from row 5 of the trail.
The order of the parts is the point: rules first, explanation second.

```
( ! )  Invoice blocked
       The rules found 2 problems. Nothing was approved.

WHAT THE RULES FOUND
  1. PIPE-20: the unit price is R 450.00. The order says R 420.00.
  2. The invoice total is R 9 420.00. It should be R 9 180.00.

┌ - - - - - - - - - - - - - - - - - - - - - - - ┐
  Explanation by Bona AI
  "The pipes are priced R 30 higher than agreed ..."
  Bona AI explains what the rules found. It decides nothing.
└ - - - - - - - - - - - - - - - - - - - - - - - ┘

[ Send a corrected invoice ]
```

1. **Header.** `alert` icon in `danger`, title "Invoice blocked", then "The rules found 1
   problem." / "The rules found N problems." and "Nothing was approved."
2. **What the rules found.** A numbered list, one row per `MatchReason`, in the order given.
   Solid border, `surface` ground. This block is the result.
3. **The explanation.** A separate box under the list with a dashed border and `sunken`
   ground, so it cannot be mistaken for the result. Its label is a `Badge`:
   - `source: "ai"`: "Explanation by Bona AI", with the small Bolt face beside it.
   - `source: "rules"`: "In plain words". No AI label, no Bolt.
     The last line is always: "Bona AI explains what the rules found. It decides nothing."
     (for `rules`: "This explains what the rules found.")
     While it loads: a two-line `Skeleton` inside the box. If it fails: the box is not shown.
4. **Action.** Supplier: **Send a corrected invoice** (reopens the invoice steps with the
   fields kept). Everyone else: no button, the line "Waiting for the supplier to send a
   corrected invoice."

Reason sentences (`{sku}` is shown as the line code, amounts through the money formatter):

| Code                     | With numbers                                                                           | Without prices                                     |
| ------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `order_version_changed`  | The invoice is for version {actual} of the order. The order is now version {expected}. | the same                                           |
| `order_not_acknowledged` | The order has not been acknowledged yet.                                               | the same                                           |
| `wrong_supplier`         | The supplier reference on the invoice is not the one on the order.                     | the same                                           |
| `duplicate_invoice`      | This invoice number was already used on this order.                                    | the same                                           |
| `missing_receipt`        | No delivery has been recorded for this order yet.                                      | the same                                           |
| `unknown_line`           | {sku}: this line is on the invoice but not on the order.                               | the same                                           |
| `missing_line`           | {sku}: this line is on the order but not on the invoice.                               | the same                                           |
| `excess_quantity`        | {sku}: {actual} invoiced, but only {expected} arrived.                                 | the same                                           |
| `quantity_mismatch`      | {sku}: {actual} invoiced, {expected} ordered.                                          | the same                                           |
| `unit_price_mismatch`    | {sku}: the unit price is {actual}. The order says {expected}.                          | {sku}: the unit price is not the one on the order. |
| `total_mismatch`         | The invoice total is {actual}. It should be {expected}.                                | The invoice total is not the order total.          |

The matched result uses the same frame: `shieldCheck` in `st-verified`, title "Invoice
matched", "It agrees with the order and the delivery.", no explanation box, and the next
step: "Next: an independent reviewer checks the repair."

## Sign-in role cards

The demo sign-in page shows one card per account, in the order people act on a case, so the
page doubles as a map of the trail.

| Group            | Cards, in order                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Community        | Community reporter                                                                                              |
| The repair trail | School administrator · Programme buyer · Supplier · Receiving officer · Independent reviewer · Payment approver |
| Oversight        | District official                                                                                               |

Card anatomy (the whole card is one button):

```
[icon]  Programme buyer                    Step 1
        Naledi Dlamini
        Approve the work order for a reported problem.
        Sign in as a programme buyer  →
```

- Icon: the workspace icon from `WORKSPACE` in a 44 px `earth-soft` circle.
- Role name: `font-display`, `text-lg`. Person's name: `text-sm text-muted` (a synthetic demo
  name). The "can" line: `roleCan` from `en.ts`.
- The step tag on trail cards: School administrator "Reports and repairs", Programme buyer
  "Step 1", Supplier "Steps 2 and 3", Receiving officer "Step 4", Independent reviewer
  "Step 6", Payment approver "Step 7". (Step 5 is the rules, so it has no card.)
- Grid: one column at 390 px, two at 768 px, three at 1440 px. Group headings are `h2`.
- Focus: the standard ring on the card. Hover: border turns `brand`. While signing in:
  the card shows "Signing in as the programme buyer…" and the others are disabled.
- Above the cards: "This is a demo. Tap a role to sign in as that person. Nothing here is real."

## Open points

For the coordinator. None of these blocks the builders; each has a fallback.

1. **Public row 5 needs the outcome.** `PublicTrailStep` carries no machine-readable result
   for `match_recorded`, so the public trail cannot show "blocked" without reading the `note`
   text. Suggested: add `outcome?: "matched" | "blocked"` to the public step (it is not an
   amount or a name). Fallback: the backend exports its two note constants and the screen
   compares against them.
2. **Wording for `src/i18n/en.ts`.** The actor label `system` reads "BonaBlock"; it should be
   "Bona Chain rules". "Goods receipt recorded" should read "Delivery recorded" and
   "Three-way match recorded" should read "Invoice checked against order and delivery" where
   the public can see them. `openInVerify` and `openVerify` still say "BonaBlock Verify".
3. **One wording source for reasons.** The reason sentences above and `ruleExplanation` in
   `src/shared/procurement/explain.ts` should be the same sentences. Suggested: the backend
   builder copies the "With numbers" column.
