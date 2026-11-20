/**
 * English messages for the procurement screens (work queue, work order,
 * invoice, goods receipt, three-way match, release instruction).
 *
 * Merged into the messages object in `./en.ts` under the `procurement` key,
 * so screens read `useMessages().procurement`. Same rules as `en.ts`: short,
 * plain sentences. A release is an instruction, not a payment.
 *
 * The wording follows docs/design/BONA_CHAIN_SCREENS.md. The sentence for a
 * match reason is not here: it comes from `reasonSentence` in `@/shared`, the
 * one source the rule list and the plain explanation share.
 */
import type {
  ProcurementStage,
  ReleaseBlockerCode,
  SessionRole,
  WorkQueueAction,
} from "@/data/types";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The eight rows of the trail, in the order they are always shown. */
export type TrailRowKey =
  | "reported"
  | "order"
  | "acknowledged"
  | "invoice"
  | "delivery"
  | "match"
  | "verified"
  | "release";

/** The four roles that have a procurement home. */
export type ProcurementRole = Extract<
  SessionRole,
  "buyer" | "supplier" | "receiving_officer" | "payment_approver"
>;

export const procurement = {
  /** The last line of every signed-in procurement screen. */
  testnet: "Test network only. No real money moves.",
  /** The rule engine. Never a person and never "AI". */
  rules: "Bona Chain rules",

  stage: {
    label: {
      order_approved: "Order approved",
      order_acknowledged: "Order acknowledged",
      invoice_blocked: "Invoice blocked",
      invoice_matched: "Invoice matched",
      awaiting_verification: "Waiting for reviewer",
      ready_for_release: "Ready for release",
      release_authorised: "Release authorised",
    } satisfies Record<ProcurementStage, string>,
    meaning: {
      order_approved: "Waiting for the supplier to acknowledge the order.",
      order_acknowledged: "Waiting for the supplier's invoice and the delivery record.",
      invoice_blocked: "The invoice does not match the order or the delivery.",
      invoice_matched: "The invoice matches the order and the delivery.",
      awaiting_verification:
        "The invoice matches. An independent reviewer has not checked the repair.",
      ready_for_release:
        "Everything is checked. The payment approver can authorise the release.",
      release_authorised: "A release instruction was authorised. No money moved.",
    } satisfies Record<ProcurementStage, string>,
    /** Before a work order exists. */
    noOrder: "No work order yet",
  },

  home: {
    intro: {
      buyer: "Reported problems that need a work order approved.",
      supplier: "Orders to acknowledge and invoices to send.",
      receiving_officer: "Orders waiting for you to record what arrived.",
      payment_approver:
        "Orders waiting for a release instruction, and what each one still needs.",
    } satisfies Record<ProcurementRole, string>,
    empty: {
      buyer: "No problems are waiting for a work order.",
      supplier: "No orders are waiting for you.",
      receiving_officer: "No deliveries are waiting to be recorded.",
      payment_approver:
        "No releases are waiting. Orders appear here as soon as a work order is approved.",
    } satisfies Record<ProcurementRole, string>,
    nextForYou: "Next for you",
    alsoWaiting: (n: number) => `Also waiting (${n})`,
    waitingSince: (when: string) => `Waiting since ${when}`,
    backToList: "Back to your list",
    /** The button on a queue card, by what the person is asked to do. */
    open: {
      approve_order: "Write the work order",
      acknowledge_order: "See the order",
      submit_invoice: "Send your invoice",
      record_receipt: "Record the delivery",
      authorise_release: "See the release gate",
    } satisfies Record<WorkQueueAction, string>,
    /** One line on a compact queue row. */
    asks: {
      approve_order: "Needs a work order",
      acknowledge_order: "Order to acknowledge",
      submit_invoice: "Invoice to send",
      record_receipt: "Delivery to record",
      authorise_release: "Release to decide",
    } satisfies Record<WorkQueueAction, string>,
    locked: (n: number) => `Locked: ${count(n, "thing", "things")} must happen first`,
    readyToAuthorise: "Ready to authorise",
    publicPage: "See the public page for this case",
    notFound: "We could not find this case in your work. It may belong to someone else.",
    nothingToDo: "Nothing is waiting for you on this case.",
  },

  order: {
    title: "Work order",
    version: (n: number) => `Version ${n}`,
    scope: "Scope of work",
    supplier: "Supplier",
    lines: "Lines",
    code: "Code",
    description: "Description",
    quantity: "Quantity",
    unitPrice: "Unit price",
    lineTotal: "Line total",
    total: "Total",
    ordered: (n: number) => `Ordered: ${n}`,
    see: "See the order",
    summaryWithTotal: (lines: number, total: string) =>
      `${count(lines, "line", "lines")} · ${total}`,
    summaryWithItems: (lines: number, items: number) =>
      `${count(lines, "line", "lines")} · ${count(items, "item", "items")}`,
  },

  orderForm: {
    problem: "The problem",
    title: "The work order",
    supplierRef: "Supplier reference",
    supplierRefHint:
      "The registration reference of the supplier who will do the work, for example SUP-2026-0417.",
    scope: "Scope of work",
    scopeHint:
      "What must be done, in plain words. The supplier and the school will read this.",
    linesTitle: "Lines",
    line: (n: number) => `Line ${n}`,
    code: "Code",
    description: "Description",
    quantity: "Quantity",
    unitPrice: "Unit price in rand",
    lineTotal: "Line total",
    addLine: "Add a line",
    removeLine: (n: number) => `Remove line ${n}`,
    total: "Order total",
    submit: "Approve work order",
    success: "Work order approved. The supplier has been asked to acknowledge it.",
    unknownSupplier:
      "No supplier is registered with that reference. Check it and try again.",
    errors: {
      supplierRef: "Type the supplier's registration reference.",
      scope: "Describe the work that must be done.",
      code: "Give this line a short code.",
      duplicateCode: "Each line needs its own code.",
      description: "Say what this line is.",
      quantity: "Type a whole number of 1 or more.",
      unitPrice: "Type the price in rand, for example 685.00.",
      fix: "Some fields are empty or wrong. Check the marked fields.",
    },
  },

  acknowledge: {
    title: "An order for you",
    intro:
      "Read the order. Acknowledge it when you accept the scope, the lines and the prices.",
    submit: "Acknowledge order",
    success: "Order acknowledged. You can now send your invoice.",
    next: "Send your invoice",
  },

  invoiceForm: {
    flow: "Send your invoice",
    pasteTitle: "1. Paste your invoice",
    pasteLabel: "Invoice text",
    pasteHint:
      "Paste the text of your invoice, up to 6 000 characters. Bona AI reads it into the fields below for you to check.",
    /** Bona AI reads at most this much text. */
    pasteLimit: 6000,
    flagsTitle: "Bona AI also noticed",
    read: "Read it with Bona AI",
    typeMyself: "Type the fields myself",
    sample: "Use sample invoice",
    sampleWrong: "Use sample invoice with a mistake",
    sampleNote: "Sample invoices for this order, for the demo:",
    readFailed: "Bona AI could not read the text. You can type the fields yourself.",
    pasteFirst: "Paste the invoice text first.",
    checkTitle: "2. Check the fields",
    aiBanner:
      "Bona AI filled these in from your text. Check each one. Bona AI does not submit or approve anything.",
    notFound: "Not found in your text",
    invoiceNumber: "Invoice number",
    orderVersion: "Order version",
    orderVersionHint: (n: number) => `The order is at version ${n}.`,
    line: (n: number) => `Line ${n}`,
    code: "Code",
    description: "Description",
    quantity: "Quantity",
    unitPrice: "Unit price in rand",
    addLine: "Add a line",
    removeLine: (n: number) => `Remove line ${n}`,
    total: "Invoice total in rand",
    totalHint: "The total as it is printed on your invoice.",
    submitTitle: "3. Submit",
    submitNote:
      "The rules compare your invoice with the order and the delivery straight away.",
    submit: "Submit invoice",
    errors: {
      invoiceNumber: "Type the invoice number.",
      orderVersion: "Type the order version as a whole number.",
      code: "Type the line code.",
      duplicateCode: "Each line needs its own code.",
      description: "Say what this line is.",
      quantity: "Type a whole number of 1 or more.",
      unitPrice: "Type the price in rand, for example 685.00.",
      total: "Type the invoice total in rand.",
      fix: "Some fields are empty or wrong. Check the marked fields.",
    },
  },

  match: {
    blockedTitle: "Invoice blocked",
    blockedCount: (n: number) => `The rules found ${count(n, "problem", "problems")}.`,
    nothingApproved: "Nothing was approved.",
    found: "What the rules found",
    byAi: "Explanation by Bona AI",
    plain: "In plain words",
    aiNote: "Bona AI explains what the rules found. It decides nothing.",
    plainNote: "This explains what the rules found.",
    correct: "Send a corrected invoice",
    waitingForSupplier: "Waiting for the supplier to send a corrected invoice.",
    matchedTitle: "Invoice matched",
    matchedBody: "It agrees with the order and the delivery.",
    matchedNext: "Next: an independent reviewer checks the repair.",
    invoice: (number: string) => `Invoice ${number}`,
  },

  receiptForm: {
    title: "What arrived?",
    intro: "Count what was delivered and type the number for each line.",
    arrived: "Arrived",
    photos: "Photos of the delivery",
    photosHelp:
      "A photo of the goods or of the delivery note. Only its fingerprint is recorded.",
    submit: "Record delivery",
    error: "Type a whole number for every line. Type 0 if nothing arrived.",
    lineError: "Type a whole number. Type 0 if nothing arrived.",
    success: (parts: string[], more: number) =>
      `Delivery recorded. ${parts.join(", ")}${
        more > 0 ? ` and ${count(more, "more line", "more lines")}` : ""
      }.`,
    part: (arrived: number, ordered: number, description: string) =>
      `${arrived} of ${ordered} ${description}`,
    recorded: "The delivery for this order is recorded.",
  },

  gate: {
    lockedTitle: "Release locked",
    lockedCount: (n: number) => `${count(n, "thing", "things")} must happen first.`,
    lockedButton: "Release locked",
    lockedAnnounce: (n: number) =>
      `Release is locked. ${count(n, "thing", "things")} must happen first.`,
    openTitle: "Ready to authorise",
    openBody: "Everything is checked.",
    authorise: "Authorise release",
    doneTitle: "Release authorised",
    doneByYou: (when: string) => `Authorised by you on ${when}.`,
    doneAt: (when: string) => `Authorised on ${when}.`,
    success:
      "Release authorised. This is an instruction. No money moved on this test network.",
    confirmTitle: (reference: string) => `Authorise the release for ${reference}?`,
    confirmBody:
      "This records a release instruction on the Avalanche Fuji test network. No money moves.",
    conflict: "The release could not be authorised. Something changed on this case.",
    /** The question sent to Bona AI. The assistant answers it from the release gate. */
    askAi: (reference: string) => `What is blocking payment on ${reference}?`,
    aiLabel: "Bona AI",
    aiNote:
      "Bona AI explains the release gate. It decides nothing and authorises nothing.",
    aiFailed: "Bona AI could not answer just now. The checklist above is what counts.",
    probe: {
      action: "Ask the Avalanche contract",
      help: "This asks the smart contract whether it would accept a release right now. Nothing is written.",
      refusedTitle: "The contract refused",
      allowedTitle: "The contract would accept a release now",
      reason: "The contract's answer",
      live: "Answered by this institution's Finance contract on the Avalanche Fuji test network. Nothing was written.",
      simulated:
        "Sample data: this answer came from a built-in copy of the contract's rules, not from Avalanche.",
      off: "No ledger is connected here, so the contract could not be asked.",
      failed: "The contract could not be reached just now. Try again.",
      reasons: {
        RepairNotVerified: "The repair has not been independently verified.",
        MatchNotPassing: "No invoice has passed the rules.",
        NoInvoice: "There is no invoice yet.",
        NoGoodsReceipt: "No delivery is recorded.",
        InvalidOrderState: "The order is not in a state that allows a release.",
        SeparationOfDuties: "This account already acted on this order in another role.",
        DisputeOpen: "A dispute is open on this order.",
        Unauthorized: "This account is not the payment approver for this institution.",
        WorkOrderNotFound: "The contract has no record of this work order.",
      } as Record<string, string>,
    },
    state: { done: "Done:", problem: "Problem:", waiting: "Waiting:" },
    checklist: "What the release needs",
    acknowledged: {
      cleared: "The supplier acknowledged the order.",
      waiting: "Waiting for the supplier to acknowledge the order.",
    },
    invoice: {
      cleared: "The invoice matches the order and the delivery.",
      none: "Waiting for the supplier's invoice.",
      blocked: "The invoice does not match the order.",
      noDelivery: "Waiting for the delivery record.",
    },
    repair: {
      cleared: "An independent reviewer verified the repair.",
      claimed: "Waiting for the independent reviewer.",
      disputed: "The reviewer found the problem is not fixed.",
      earlier: "The school has not claimed the repair yet.",
    },
    samePerson:
      "You already acted on this case in another role. A different payment approver must authorise the release.",
    /** The same blockers in a few words, for a queue row. */
    short: {
      repair_not_verified: "the repair is not verified",
      no_matching_invoice: "no matching invoice",
      order_not_acknowledged: "the order is not acknowledged",
      already_released: "already released",
      same_person: "you acted on this case in another role",
    } satisfies Record<ReleaseBlockerCode, string>,
  },

  trail: {
    publicTitle: "Who did what, and the proof",
    publicIntro:
      "Each step is recorded on the Avalanche Fuji test network. Amounts and names are not public.",
    staffTitle: "The trail for this case",
    tab: "Trail",
    next: "Next",
    state: { done: "Done:", waiting: "Waiting:", blocked: "Blocked:" },
    title: {
      reported: "Problem reported",
      order: "Work order approved",
      acknowledged: "Supplier acknowledged the order",
      invoice: "Invoice submitted",
      delivery: "Delivery recorded",
      match: "Invoice checked against order and delivery",
      verified: "Repair independently verified",
      release: "Release authorised",
    } satisfies Record<TrailRowKey, string>,
    waiting: {
      reported: "",
      order: "Waiting for the programme buyer to approve a work order.",
      acknowledged: "Waiting for the supplier to acknowledge the order.",
      invoice: "Waiting for the supplier's invoice.",
      delivery: "Waiting for the receiving officer to record the delivery.",
      match: "Checked automatically when the invoice and the delivery are both in.",
      verified: "Waiting for the independent reviewer.",
      release: "Locked until the invoice matches and the reviewer has verified.",
    } satisfies Record<TrailRowKey, string>,
    matchBlocked:
      "The invoice does not match. The supplier must send a corrected invoice.",
    matchDone: "The invoice matches the order and the delivery.",
    disputed: "The reviewer found the problem is not fixed.",
    releaseDone: "Release authorised. An instruction, not a payment.",
    earlierBlocked: (n: number) =>
      n === 1 ? "1 earlier invoice was blocked." : `${n} earlier invoices were blocked.`,
    justNow: "just now",
    minutesAgo: (n: number) => count(n, "minute ago", "minutes ago"),
    hoursAgo: (n: number) => count(n, "hour ago", "hours ago"),
    arrived: (arrived: number, ordered: number) =>
      `${arrived} of ${count(ordered, "item", "items")} arrived`,
    reasons: (n: number) => count(n, "reason", "reasons"),
    aiDrafted: "Fields read by Bona AI, checked by the supplier.",
    unavailable: "The trail could not be loaded.",
  },

  signIn: {
    note: "This is a demo. Tap a role to sign in as that person. Nothing here is real.",
    groups: {
      demo: "In the live demo",
      more: "More roles",
    },
    step: {
      school_admin: "Reports and repairs",
      buyer: "Step 1",
      supplier: "Steps 2 and 3",
      receiving_officer: "Step 4",
      independent_reviewer: "Step 6",
      payment_approver: "Step 7",
    } satisfies Partial<Record<SessionRole, string>>,
    signInAs: (aRole: string) => `Sign in as ${aRole}`,
  },
};
